import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { DEFAULT_LOCALE, isValidLocale } from "@/lib/locales";

/**
 * Write layer for the Template Center. Operates on the existing WhatsappTemplate / EmailTemplate rows
 * (and EmailLayout). It never sends, never contacts a provider, never fabricates provider approval,
 * and never stores a secret. All mutating operations are audited by the caller-supplied actor.
 *
 * "Language variants" live in each row's `translations` JSON (WhatsApp: {body}, Email: {subject}) plus
 * the content-mode `content` JSON for the email layout builder — matching the existing data model.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
export type ServiceResult<T = { id: string }> = { ok: true; data: T } | { ok: false; status: number; error: string };

export type TemplateChannel = "WHATSAPP" | "EMAIL" | "SMS";

function usesWhatsappStore(channel: TemplateChannel) {
  return channel === "WHATSAPP" || channel === "SMS";
}

async function audit(actor: Actor, action: string, ar: string, en: string, entityId: string, metadata: Record<string, unknown>) {
  await writeAuditLog({
    actorId: actor.actorId ?? undefined,
    actorName: actor.actorName ?? undefined,
    actorRole: actor.actorRole ?? "ADMIN",
    action,
    messageAr: ar,
    messageEn: en,
    entityType: "CommunicationTemplate",
    entityId,
    metadata: { ...metadata, externalCall: false },
    stream: "TEAM",
  });
}

// ─────────────────────────── Create group + first variant ───────────────────────────

export type CreateTemplateInput = {
  channel: TemplateChannel;
  kind: "SYSTEM" | "CAMPAIGN";
  name: string;
  language: string; // base variant language
  purpose?: string | null;
  // WhatsApp / SMS
  body?: string;
  footerText?: string | null;
  // Email content-mode
  subject?: string;
  preheader?: string | null;
  layoutId?: string | null;
  title?: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
};

export async function createTemplateGroup(input: CreateTemplateInput, actor: Actor): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  const name = input.name?.trim();
  if (!name) return { ok: false, status: 400, error: "الاسم مطلوب." };
  const kind = input.kind === "SYSTEM" ? "SYSTEM" : "CAMPAIGN";
  const language = isValidLocale(input.language) ? input.language : DEFAULT_LOCALE;

  try {
    if (usesWhatsappStore(input.channel)) {
      const body = (input.body ?? "").trim();
      if (!body) return { ok: false, status: 400, error: "نص القالب مطلوب." };
      const translations = language !== DEFAULT_LOCALE ? { [language]: { body } } : undefined;
      const row = await prisma.whatsappTemplate.create({
        data: {
          name,
          body,
          kind,
          status: "DRAFT",
          purpose: input.purpose ?? null,
          category: input.purpose ?? null,
          channel: input.channel === "SMS" ? "SMS" : "WHATSAPP",
          provider: "MANUAL",
          footerText: input.footerText ?? null,
          translations: (translations ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        select: { id: true },
      });
      await audit(actor, "communication.template.create", `إنشاء قالب ${input.channel}: ${name}`, `Created ${input.channel} template: ${name}`, row.id, { channel: input.channel, kind });
      return { ok: true, data: { id: row.id } };
    }

    // EMAIL — content-mode. The legacy @usewaypoint `document` path is untouched; content templates
    // store their fields in `content` and render inside an EmailLayout.
    const subject = (input.subject ?? "").trim();
    if (!subject) return { ok: false, status: 400, error: "عنوان الإيميل مطلوب." };
    const contentVariant = { title: input.title ?? "", body: input.body ?? "", ctaText: input.ctaText ?? "", ctaUrl: input.ctaUrl ?? "", footerNote: input.footerNote ?? "" };
    const row = await prisma.emailTemplate.create({
      data: {
        name,
        subject,
        document: {} as Prisma.InputJsonValue,
        kind,
        status: "DRAFT",
        purpose: input.purpose ?? null,
        preheader: input.preheader ?? null,
        layoutId: input.layoutId ?? null,
        content: { [language]: contentVariant } as Prisma.InputJsonValue,
        translations: language !== DEFAULT_LOCALE ? ({ [language]: { subject } } as Prisma.InputJsonValue) : undefined,
      },
      select: { id: true },
    });
    await audit(actor, "communication.template.create", `إنشاء قالب إيميل: ${name}`, `Created email template: ${name}`, row.id, { channel: "EMAIL", kind });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("createTemplateGroup failed", error);
    return { ok: false, status: 500, error: "تعذّر إنشاء القالب." };
  }
}

// ─────────────────────────── Locate a group across both stores ───────────────────────────

async function locateGroup(id: string): Promise<{ channel: TemplateChannel; store: "WA" | "EMAIL" } | null> {
  const wa = await prisma.whatsappTemplate.findUnique({ where: { id }, select: { id: true, channel: true } }).catch(() => null);
  if (wa) return { channel: (wa.channel ?? "").toUpperCase() === "SMS" ? "SMS" : "WHATSAPP", store: "WA" };
  const em = await prisma.emailTemplate.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
  if (em) return { channel: "EMAIL", store: "EMAIL" };
  return null;
}

// ─────────────────────────── Duplicate group ───────────────────────────

export async function duplicateTemplateGroup(id: string, actor: Actor): Promise<ServiceResult> {
  const loc = await locateGroup(id);
  if (!loc) return { ok: false, status: 404, error: "القالب غير موجود." };
  try {
    if (loc.store === "WA") {
      const src = await prisma.whatsappTemplate.findUnique({ where: { id } });
      if (!src) return { ok: false, status: 404, error: "القالب غير موجود." };
      const row = await prisma.whatsappTemplate.create({
        data: {
          name: `${src.name} (نسخة)`,
          body: src.body,
          translations: (src.translations ?? undefined) as Prisma.InputJsonValue | undefined,
          kind: src.kind ?? "CAMPAIGN",
          status: "DRAFT",
          purpose: src.purpose ?? null,
          category: src.category ?? null,
          channel: src.channel ?? "WHATSAPP",
          provider: "MANUAL",
          footerText: src.footerText ?? null,
          header: (src.header ?? undefined) as Prisma.InputJsonValue | undefined,
          buttons: (src.buttons ?? undefined) as Prisma.InputJsonValue | undefined,
          variables: (src.variables ?? undefined) as Prisma.InputJsonValue | undefined,
          // Provider approval / external IDs are intentionally cleared — a copy is NOT approved.
          externalTemplateId: null,
          approvalStatus: null,
          language: src.language ?? null,
        },
        select: { id: true },
      });
      await audit(actor, "communication.template.duplicate", `نسخ قالب: ${src.name}`, `Duplicated template: ${src.name}`, row.id, { sourceId: id, providerIdsCleared: true });
      return { ok: true, data: { id: row.id } };
    }
    const src = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!src) return { ok: false, status: 404, error: "القالب غير موجود." };
    const row = await prisma.emailTemplate.create({
      data: {
        name: `${src.name} (نسخة)`,
        subject: src.subject,
        document: (src.document ?? {}) as Prisma.InputJsonValue,
        translations: (src.translations ?? undefined) as Prisma.InputJsonValue | undefined,
        content: (src.content ?? undefined) as Prisma.InputJsonValue | undefined,
        kind: src.kind ?? "CAMPAIGN",
        status: "DRAFT",
        purpose: src.purpose ?? null,
        preheader: src.preheader ?? null,
        layoutId: src.layoutId ?? null, // keep the same layout on duplicate
      },
      select: { id: true },
    });
    await audit(actor, "communication.template.duplicate", `نسخ قالب إيميل: ${src.name}`, `Duplicated email template: ${src.name}`, row.id, { sourceId: id, keptLayout: true });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("duplicateTemplateGroup failed", error);
    return { ok: false, status: 500, error: "تعذّر نسخ القالب." };
  }
}

// ─────────────────────────── Update group ───────────────────────────

export type UpdateTemplateInput = {
  name?: string;
  status?: string;
  purpose?: string | null;
  body?: string;
  subject?: string;
  preheader?: string | null;
  footerText?: string | null;
};

const ALLOWED_STATUS = ["DRAFT", "READY", "NEEDS_REVIEW", "ARCHIVED"];

export async function updateTemplateGroup(id: string, input: UpdateTemplateInput, actor: Actor): Promise<ServiceResult> {
  const loc = await locateGroup(id);
  if (!loc) return { ok: false, status: 404, error: "القالب غير موجود." };
  const status = input.status && ALLOWED_STATUS.includes(input.status.toUpperCase()) ? input.status.toUpperCase() : undefined;
  try {
    if (loc.store === "WA") {
      await prisma.whatsappTemplate.update({
        where: { id },
        data: {
          name: input.name?.trim() || undefined,
          status,
          purpose: input.purpose ?? undefined,
          body: typeof input.body === "string" ? input.body : undefined,
          footerText: input.footerText ?? undefined,
        },
      });
    } else {
      await prisma.emailTemplate.update({
        where: { id },
        data: {
          name: input.name?.trim() || undefined,
          status,
          purpose: input.purpose ?? undefined,
          subject: typeof input.subject === "string" && input.subject.trim() ? input.subject.trim() : undefined,
          preheader: input.preheader ?? undefined,
        },
      });
    }
    await audit(actor, "communication.template.update", `تعديل قالب`, `Updated template`, id, { status });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("updateTemplateGroup failed", error);
    return { ok: false, status: 500, error: "تعذّر تحديث القالب." };
  }
}

// ─────────────────────────── Add / duplicate a language variant ───────────────────────────

function mergeTranslations(existing: unknown, locale: string, value: Record<string, unknown>): Record<string, unknown> {
  const base = (existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {}) as Record<string, unknown>;
  base[locale] = value;
  return base;
}

export async function upsertVariant(
  id: string,
  input: { language: string; body?: string; subject?: string; title?: string; ctaText?: string; ctaUrl?: string; footerNote?: string; duplicateFrom?: string },
  actor: Actor
): Promise<ServiceResult> {
  const loc = await locateGroup(id);
  if (!loc) return { ok: false, status: 404, error: "القالب غير موجود." };
  const target = input.language;
  if (!isValidLocale(target)) return { ok: false, status: 400, error: "لغة غير صحيحة." };

  try {
    if (loc.store === "WA") {
      const row = await prisma.whatsappTemplate.findUnique({ where: { id }, select: { body: true, translations: true } });
      if (!row) return { ok: false, status: 404, error: "القالب غير موجود." };
      let body = input.body ?? "";
      if (input.duplicateFrom) {
        // Copy content from another language (no automatic translation — target stays a draft).
        const from = input.duplicateFrom;
        const tr = (row.translations ?? {}) as Record<string, { body?: string }>;
        body = from === DEFAULT_LOCALE ? row.body : tr[from]?.body ?? row.body;
      }
      const translations = mergeTranslations(row.translations, target, { body });
      await prisma.whatsappTemplate.update({ where: { id }, data: { translations: translations as Prisma.InputJsonValue, status: "DRAFT" } });
    } else {
      const row = await prisma.emailTemplate.findUnique({ where: { id }, select: { subject: true, translations: true, content: true } });
      if (!row) return { ok: false, status: 404, error: "القالب غير موجود." };
      let subject = input.subject ?? row.subject;
      let variant = { title: input.title ?? "", body: input.body ?? "", ctaText: input.ctaText ?? "", ctaUrl: input.ctaUrl ?? "", footerNote: input.footerNote ?? "" };
      if (input.duplicateFrom) {
        const from = input.duplicateFrom;
        const tr = (row.translations ?? {}) as Record<string, { subject?: string }>;
        const ct = (row.content ?? {}) as Record<string, typeof variant>;
        subject = from === DEFAULT_LOCALE ? row.subject : tr[from]?.subject ?? row.subject;
        variant = ct[from] ?? variant;
      }
      const translations = mergeTranslations(row.translations, target, { subject });
      const content = mergeTranslations(row.content, target, variant);
      await prisma.emailTemplate.update({
        where: { id },
        data: { translations: translations as Prisma.InputJsonValue, content: content as Prisma.InputJsonValue, status: "DRAFT" },
      });
    }
    await audit(actor, input.duplicateFrom ? "communication.template.variant.duplicate" : "communication.template.variant.add", `إضافة لغة (${target}) لقالب`, `Added language ${target} to template`, id, { language: target, duplicatedFrom: input.duplicateFrom ?? null });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("upsertVariant failed", error);
    return { ok: false, status: 500, error: "تعذّر حفظ اللغة." };
  }
}

// ─────────────────────────── Email layouts ───────────────────────────

export async function createEmailLayout(
  input: { name: string; description?: string | null; htmlShell: string; contentSlot?: string; headerHtml?: string | null; footerHtml?: string | null; ctaSection?: string | null; unsubscribePlaceholder?: boolean; isDefault?: boolean },
  actor: Actor
): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  const name = input.name?.trim();
  if (!name) return { ok: false, status: 400, error: "اسم التصميم مطلوب." };
  const htmlShell = input.htmlShell?.trim();
  if (!htmlShell) return { ok: false, status: 400, error: "هيكل HTML مطلوب." };
  const contentSlot = input.contentSlot?.trim() || "{{content}}";
  if (!htmlShell.includes(contentSlot)) return { ok: false, status: 400, error: `هيكل HTML يجب أن يحتوي على خانة المحتوى ${contentSlot}.` };
  try {
    if (input.isDefault) await prisma.emailLayout.updateMany({ where: { isDefault: true }, data: { isDefault: false } }).catch(() => {});
    const row = await prisma.emailLayout.create({
      data: {
        name,
        description: input.description ?? null,
        htmlShell,
        contentSlot,
        headerHtml: input.headerHtml ?? null,
        footerHtml: input.footerHtml ?? null,
        ctaSection: input.ctaSection ?? null,
        unsubscribePlaceholder: !!input.unsubscribePlaceholder,
        isDefault: !!input.isDefault,
        status: "DRAFT",
      },
      select: { id: true },
    });
    await audit(actor, "communication.email-layout.create", `إنشاء تصميم إيميل: ${name}`, `Created email layout: ${name}`, row.id, {});
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("createEmailLayout failed", error);
    return { ok: false, status: 500, error: "تعذّر إنشاء التصميم." };
  }
}
