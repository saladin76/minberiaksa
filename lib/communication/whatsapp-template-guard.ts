import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * What may be edited on a WhatsApp template, and what may be deleted.
 *
 * **Provider-owned fields are not ours to edit.** `approvalStatus`, `language`, `category`,
 * `externalTemplateId`, `templateType`, `header` and `buttons` describe what Meta (or Twilio)
 * registered and approved. They were writable from the dashboard, which meant somebody could set a
 * rejected template to "approved" and the platform would believe it  until a campaign was built on
 * it, scheduled, approved, and then failed at send time with `META_TEMPLATE_REQUIRED`. The provider
 * writes these through its sync (`whatsapp-template-sync.ts`) and nothing else does.
 *
 * **Approved content is not ours to edit either.** Meta approves a specific body; editing it here
 * does not change what Meta sends, it only makes the dashboard preview disagree with the message the
 * donor receives. So once a template has an approved variant, the body and its translations are
 * frozen too, and a change means submitting a new template to Meta.
 *
 * **A referenced template is not deleted.** `prisma.whatsappTemplate.delete` left triggers pointing at
 * an id that no longer resolves  `sendTriggerMessage` returns null for a missing template, so the
 * trigger silently stopped firing with nothing anywhere saying why  and delivery history lost the
 * name of what was sent. A referenced template is archived instead, which removes it from every
 * picker while keeping the record intact.
 */

export const PROVIDER_OWNED_FIELDS = [
  "provider",
  "approvalStatus",
  "language",
  "category",
  "externalTemplateId",
  "templateType",
  "header",
  "buttons",
  "footerText",
  "qualityRating",
  "providerRaw",
  "lastImportedAt",
  "lastSyncStatus",
  "lastSyncError",
] as const;

/** Content that Meta approved as a unit, and that therefore cannot be edited in place. */
export const APPROVED_CONTENT_FIELDS = ["body", "translations", "variables"] as const;

export type EditRejection = { ok: false; status: number; error: string; fields: string[] };

/** Fields in this patch that belong to the provider. Empty array = nothing to object to. */
export function providerOwnedEdits(patch: Record<string, unknown>): string[] {
  return PROVIDER_OWNED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
}

export async function hasApprovedVariant(templateId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const count = await prisma.whatsappTemplateVariant
    .count({ where: { templateId, approvalStatus: "APPROVED" } })
    .catch(() => 0);
  return count > 0;
}

/**
 * Gate one edit. Returns null when the edit is allowed.
 *
 * Renaming stays allowed on purpose: the variant carries `providerTemplateName`, the name actually
 * sent to Meta, so a local rename is an editorial label change and cannot break sending.
 */
export async function rejectDisallowedTemplateEdit(
  templateId: string,
  patch: Record<string, unknown>,
): Promise<EditRejection | null> {
  const owned = providerOwnedEdits(patch);
  if (owned.length) {
    return {
      ok: false,
      status: 409,
      error: "هذه الحقول يملكها المزوّد وتُحدَّث من مزامنة Meta فقط.",
      fields: owned,
    };
  }
  const content = APPROVED_CONTENT_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (content.length && (await hasApprovedVariant(templateId))) {
    return {
      ok: false,
      status: 409,
      error: "القالب معتمد من Meta  تعديل نصه هنا لا يغيّر ما يُرسل فعليًا. أنشئ قالبًا جديدًا وأرسله للاعتماد.",
      fields: [...content],
    };
  }
  return null;
}

export type TemplateReferences = { triggers: number; campaigns: number; deliveries: number; total: number };

/** Everything that still points at this template. */
export async function templateReferences(templateId: string): Promise<TemplateReferences> {
  if (!process.env.DATABASE_URL) return { triggers: 0, campaigns: 0, deliveries: 0, total: 0 };
  const [triggers, campaigns, deliveries] = await Promise.all([
    prisma.messageTrigger.count({ where: { templateId } }).catch(() => 0),
    prisma.communicationCampaign.count({ where: { templateGroupId: templateId } }).catch(() => 0),
    prisma.communicationDelivery.count({ where: { templateId } }).catch(() => 0),
  ]);
  return { triggers, campaigns, deliveries, total: triggers + campaigns + deliveries };
}

export type DeleteOutcome =
  | { action: "DELETED"; name: string }
  | { action: "ARCHIVED"; name: string; references: TemplateReferences };

/**
 * Remove a template from use.
 *
 * Deleted outright only when nothing references it. Otherwise archived: disabled and hidden, with
 * the row kept so triggers keep resolving and delivery history keeps its name.
 */
export async function deleteOrArchiveWhatsappTemplate(templateId: string): Promise<DeleteOutcome | null> {
  const references = await templateReferences(templateId);
  if (references.total === 0) {
    const deleted = await prisma.whatsappTemplate.delete({ where: { id: templateId } }).catch(() => null);
    return deleted ? { action: "DELETED", name: deleted.name } : null;
  }
  const archived = await prisma.whatsappTemplate
    .update({ where: { id: templateId }, data: { status: "ARCHIVED" } })
    .catch(() => null);
  return archived ? { action: "ARCHIVED", name: archived.name, references } : null;
}
