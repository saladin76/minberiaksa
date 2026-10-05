import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * What may be edited on a WhatsApp template, and what may be deleted.
 *
 * **Provider-owned fields are not ours to edit.** `approvalStatus`, `language`, `category`,
 * `externalTemplateId`, `templateType`, `header` and `buttons` describe what Meta (or Twilio)
 * registered/provider state. The authored header/buttons/footer are local studio content until
 * submission and are frozen with the body once submitted. Provider status/id fields remain read-only.
 * They were writable from the dashboard, which meant somebody could set a rejected template to "approved"
 * and the platform would believe it  until a campaign was built on
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
  "qualityRating",
  "providerRaw",
  "lastImportedAt",
  "lastSyncStatus",
  "lastSyncError",
] as const;

/** Content that Meta approved as a unit, and that therefore cannot be edited in place. */
export const APPROVED_CONTENT_FIELDS = ["body", "translations", "variables", "header", "buttons", "footerText", "authentication"] as const;

export type EditRejection = { ok: false; status: number; error: string; fields: string[] };

/** Fields in this patch that belong to the provider. Empty array = nothing to object to. */
export function providerOwnedEdits(patch: Record<string, unknown>): string[] {
  return PROVIDER_OWNED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
}

export async function hasSubmittedMetaVariant(templateId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const [count, template] = await Promise.all([
    prisma.whatsappTemplateVariant.count({ where: { templateId, provider: "META_WHATSAPP" } }).catch(() => 0),
    prisma.whatsappTemplate.findUnique({ where: { id: templateId }, select: { provider: true, externalTemplateId: true } }).catch(() => null),
  ]);
  const provider = String(template?.provider ?? "").toUpperCase();
  return count > 0 || ((provider === "META" || provider === "META_WHATSAPP") && Boolean(template?.externalTemplateId));
}


function localeFromProviderLanguage(languageCode: string | null | undefined, locale: string | null | undefined): string | null {
  const direct = String(locale ?? "").trim().toLowerCase();
  if (direct) return direct;
  const code = String(languageCode ?? "").trim().toLowerCase();
  return code ? code.replace(/[_-].*$/, "") : null;
}

export async function submittedMetaLocales(templateId: string): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const rows = await prisma.whatsappTemplateWabaVariant.findMany({
    where: { templateId, provider: "META_WHATSAPP" },
    select: { languageCode: true, locale: true, providerTemplateId: true },
  }).catch(() => []);
  const locales = new Set<string>();
  for (const row of rows) {
    if (!row.providerTemplateId) continue;
    const locale = localeFromProviderLanguage(row.languageCode, row.locale);
    if (locale) locales.add(locale);
  }
  return locales;
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
    return { ok: false, status: 409, error: "هذه الحقول يملكها المزوّد وتُحدَّث من مزامنة Meta فقط.", fields: owned };
  }

  const content = APPROVED_CONTENT_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (!content.length) return null;

  const submittedLocales = await submittedMetaLocales(templateId);
  if (!submittedLocales.size) return null;

  const current = await prisma.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: { body: true, translations: true, variables: true, header: true, buttons: true, footerText: true, authentication: true },
  }).catch(() => null);
  if (!current) return null;

  const stable = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`);
      return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
  };

  const currentRecord = current as unknown as Record<string, unknown>;
  const changed: string[] = [];

  for (const field of content) {
    const nextValue = patch[field];
    const currentValue = currentRecord[field];

    if (field === "translations") {
      const before = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
        ? currentValue as Record<string, unknown>
        : {};
      const after = nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
        ? nextValue as Record<string, unknown>
        : {};

      for (const locale of submittedLocales) {
        if (locale === "ar" || !(locale in before)) continue;
        if (!(locale in after) || stable(after[locale]) !== stable(before[locale])) {
          changed.push(`translations.${locale}`);
        }
      }
      continue;
    }

    if (submittedLocales.has("ar") && stable(nextValue) !== stable(currentValue)) changed.push(field);
  }

  if (changed.length) {
    return {
      ok: false,
      status: 409,
      error: "لا يمكن تعديل لغة تم إرسالها فعليًا إلى Meta. اللغات المحلية التي لم تصل إلى Meta بعد تبقى قابلة للتعديل وإعادة الإرسال.",
      fields: changed,
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
