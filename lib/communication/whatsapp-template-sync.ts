import "server-only";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { listAllTemplates, type MetaTemplateDetail } from "./providers/meta-whatsapp/templates";

/**
 * Meta → database. The only writer of `WhatsappTemplateVariant`.
 *
 * Before this existed, "approved" in the dashboard meant a hand-set field on the local template
 * row: somebody typed a name and a status and the platform believed it. The provider was never
 * asked. A campaign could therefore be built on a template Meta had rejected, or had never heard
 * of, and the failure only appeared as `META_TEMPLATE_REQUIRED` at send time  after the campaign
 * was approved and scheduled.
 *
 * What this writes is what Meta said, per language, at the moment it said it: name, status,
 * category, rejection reason, and the component schema a sender needs to build parameters. What it
 * does NOT do is invent local records  a Meta template that matches no local template is reported
 * as unmatched rather than conjured into the content library, because the local row carries
 * editorial meaning (which trigger uses it, which campaign) that only a human can assign.
 *
 * Matching is by name, the only stable key the two sides share: Meta has no idea about our ids,
 * and our rows predate the variant model. `providerTemplateName` on the variant is then the name
 * actually sent to Meta, so a later local rename cannot break sending.
 */

export const META_PROVIDER = "META_WHATSAPP";

export type SyncSummary = {
  ok: boolean;
  fetched: number;
  matchedTemplates: number;
  variantsUpserted: number;
  variantsRemoved: number;
  unmatchedNames: string[];
  reason?: string;
  detail?: string;
};

/** Meta's language tags are `ar`, `en_US`, `pt_BR`…; the site's locales are the bare codes. */
export function localeFromMetaLanguage(language: string): SupportedLocale | null {
  const base = String(language ?? "").trim().toLowerCase().replace(/[_-].*$/, "");
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as SupportedLocale) : null;
}

/** Meta's status vocabulary, upper-cased, with anything unexpected kept visible rather than coerced. */
export function normalizeApprovalStatus(status: string): string {
  const value = String(status ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

/**
 * Pull the catalogue and write it over the variant rows for this provider.
 *
 * Variants that Meta no longer returns are deleted: a template deleted at Meta must stop looking
 * sendable here, and leaving a stale "APPROVED" row would do precisely the damage this sync exists
 * to prevent. Deletion is scoped to templates Meta *did* answer for, so a failed or partial fetch
 * cannot wipe the catalogue.
 */
export async function syncMetaWhatsappTemplates(opts: {
  businessAccountId?: string | null;
  actor?: { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;
} = {}): Promise<SyncSummary> {
  const summary: SyncSummary = { ok: false, fetched: 0, matchedTemplates: 0, variantsUpserted: 0, variantsRemoved: 0, unmatchedNames: [] };
  if (!process.env.DATABASE_URL) return { ...summary, reason: "DATABASE_UNAVAILABLE" };

  let remoteTemplates: MetaTemplateDetail[] = [];
  if (opts.businessAccountId) {
    const remote = await listAllTemplates(opts.businessAccountId);
    if (!remote.ok) return { ...summary, reason: remote.reason, detail: remote.detail };
    remoteTemplates = remote.templates;
  } else {
    /*
     * In multi-WABA mode readiness must be true for every active account routing may select, not just
     * the default account. Fetch every active Meta WABA and collapse equal name+language variants
     * into one conservative status: APPROVED only when all active WABAs report APPROVED.
     */
    const senderRows = await prisma.communicationSender.findMany({
      where: {
        channel: "WHATSAPP",
        provider: "META_WHATSAPP",
        enabled: true,
        status: "ACTIVE",
        businessAccountId: { not: null },
      },
      select: { businessAccountId: true, isDefault: true, priority: true },
      orderBy: [{ isDefault: "desc" }, { priority: "asc" }],
    }).catch(() => []);
    const wabas = [...new Set(senderRows.map((row) => row.businessAccountId?.trim()).filter(Boolean) as string[])];
    if (!wabas.length) return { ...summary, reason: "NO_ACTIVE_WABA", detail: "No active Meta WhatsApp sender has a WABA ID." };

    const catalogs: Array<{ waba: string; templates: MetaTemplateDetail[] }> = [];
    for (const waba of wabas) {
      const remote = await listAllTemplates(waba);
      if (!remote.ok) return { ...summary, reason: remote.reason, detail: `${waba}: ${remote.detail ?? remote.reason}` };
      catalogs.push({ waba, templates: remote.templates });
    }

    const byKey = new Map<string, Array<{ waba: string; row: MetaTemplateDetail }>>();
    for (const catalog of catalogs) {
      for (const row of catalog.templates) {
        const key = `${foldName(row.name)}::${String(row.language).toLowerCase()}`;
        const list = byKey.get(key) ?? [];
        list.push({ waba: catalog.waba, row });
        byKey.set(key, list);
      }
    }

    const statusRank = (status: string) => {
      const s = normalizeApprovalStatus(status);
      if (s === "REJECTED" || s === "DISABLED") return 5;
      if (s === "PAUSED") return 4;
      if (s === "PENDING" || s === "IN_REVIEW") return 3;
      if (s === "APPROVED") return 1;
      return 2;
    };

    for (const entries of byKey.values()) {
      const first = entries[0]?.row;
      if (!first) continue;
      const complete = entries.length === wabas.length;
      const worst = entries.reduce((acc, item) => statusRank(item.row.status) > statusRank(acc.status) ? item.row : acc, first);
      remoteTemplates.push({
        ...first,
        status: complete && entries.every((item) => normalizeApprovalStatus(item.row.status) === "APPROVED")
          ? "APPROVED"
          : complete
            ? normalizeApprovalStatus(worst.status)
            : "MISSING_IN_WABA",
        rejectedReason: entries.map((item) => item.row.rejectedReason).find(Boolean)
          ?? (!complete ? `Template/language exists in ${entries.length}/${wabas.length} active WABAs` : null),
      });
    }
  }
  summary.fetched = remoteTemplates.length;

  const locals = await prisma.whatsappTemplate.findMany({ select: { id: true, name: true } }).catch(() => []);
  /* Meta names are case-insensitive and lower_snake by convention; local names are whatever the
     team typed. Compare on a folded key so "Donation Receipt" finds `donation_receipt`. */
  const byFoldedName = new Map<string, string>();
  for (const local of locals) byFoldedName.set(foldName(local.name), local.id);

  const byTemplate = new Map<string, MetaTemplateDetail[]>();
  const unmatched = new Set<string>();
  for (const row of remoteTemplates) {
    if (!row.name || !row.language) continue;
    const templateId = byFoldedName.get(foldName(row.name));
    if (!templateId) { unmatched.add(row.name); continue; }
    const list = byTemplate.get(templateId) ?? [];
    list.push(row);
    byTemplate.set(templateId, list);
  }
  summary.matchedTemplates = byTemplate.size;
  summary.unmatchedNames = [...unmatched].sort();

  const now = new Date();
  for (const [templateId, rows] of byTemplate) {
    const keptLanguages: string[] = [];
    for (const row of rows) {
      const languageCode = row.language;
      keptLanguages.push(languageCode);
      const data = {
        providerTemplateName: row.name,
        providerTemplateId: row.id,
        languageCode,
        locale: localeFromMetaLanguage(languageCode),
        approvalStatus: normalizeApprovalStatus(row.status),
        category: row.category,
        rejectionReason: row.rejectedReason,
        qualityRating: row.qualityScore,
        componentsSchema: (row.components ?? undefined) as never,
        lastSyncedAt: now,
      };
      const written = await prisma.whatsappTemplateVariant
        .upsert({
          where: { templateId_provider_languageCode: { templateId, provider: META_PROVIDER, languageCode } },
          update: data,
          create: { templateId, provider: META_PROVIDER, ...data },
        })
        .catch((error: unknown) => { console.error("variant upsert failed", error); return null; });
      if (written) summary.variantsUpserted += 1;
    }
    /* Languages this template no longer has at Meta. Scoped to this template only. */
    const removed = await prisma.whatsappTemplateVariant
      .deleteMany({ where: { templateId, provider: META_PROVIDER, languageCode: { notIn: keptLanguages } } })
      .catch(() => ({ count: 0 }));
    summary.variantsRemoved += removed.count;
  }

  summary.ok = true;
  await writeAuditLog({
    actorId: opts.actor?.actorId ?? undefined,
    actorName: opts.actor?.actorName ?? undefined,
    actorRole: opts.actor?.actorRole ?? "SYSTEM",
    action: "communication.whatsapp.templates.sync",
    messageAr: `مزامنة قوالب واتساب من Meta  ${summary.variantsUpserted} نسخة لغوية عبر ${summary.matchedTemplates} قالبًا${summary.unmatchedNames.length ? `، ${summary.unmatchedNames.length} قالبًا لدى Meta بلا مقابل محلي` : ""}`,
    messageEn: `WhatsApp template sync  ${summary.variantsUpserted} language variant(s) across ${summary.matchedTemplates} template(s), ${summary.unmatchedNames.length} unmatched at Meta`,
    entityType: "WhatsappTemplate",
    metadata: { ...summary, externalCall: true },
    stream: "TEAM",
  }).catch(() => {});
  return summary;
}

function foldName(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/* ── The readiness contract ─────────────────────────────────────────────────
   One answer to "can this template be sent in this language", used by the dashboard, the campaign
   builder, the trigger builder and the runtime alike. They used to each decide for themselves 
   the dashboard on `externalTemplateId && approvalStatus === "APPROVED"` from the local row, the
   runtime by asking Meta  so the dashboard said "ready" and the send said META_TEMPLATE_REQUIRED
   about the same template. A single function cannot disagree with itself. */

export type VariantReadiness = {
  ready: boolean;
  /** Why not, when not: NO_VARIANT | NOT_APPROVED | STALE. */
  reason: string | null;
  languageCode: string | null;
  approvalStatus: string | null;
  locale: string | null;
  providerTemplateName: string | null;
  componentsSchema: unknown;
  rejectionReason: string | null;
  lastSyncedAt: Date | null;
};

export const NOT_READY: VariantReadiness = {
  ready: false, reason: "NO_VARIANT", languageCode: null, approvalStatus: null, locale: null,
  providerTemplateName: null, componentsSchema: null, rejectionReason: null, lastSyncedAt: null,
};

type VariantRow = {
  languageCode: string;
  locale: string | null;
  approvalStatus: string;
  providerTemplateName: string;
  componentsSchema: unknown;
  rejectionReason: string | null;
  lastSyncedAt: Date;
};

/**
 * Pick the variant that will actually be sent for a locale, and say whether it is sendable.
 *
 * The locale match is exact first (`fr` → the `fr` variant), then by base language (`fr` → `fr_FR`),
 * and only then the template's Arabic  because Arabic is this organisation's canonical language and
 * the body the renderer falls back to. The chosen variant's OWN language code is what must be sent
 * to Meta; that pairing is item 11's whole point, and it is why this returns the variant rather
 * than a boolean.
 */
export function resolveVariantForLocale(variants: VariantRow[], locale: string): VariantReadiness {
  if (!variants.length) return NOT_READY;
  const approved = variants.filter((v) => v.approvalStatus === "APPROVED");
  const pool = approved.length ? approved : variants;

  const base = String(locale ?? "").toLowerCase().replace(/[_-].*$/, "");
  const chosen =
    pool.find((v) => v.locale === locale) ??
    pool.find((v) => v.languageCode.toLowerCase() === locale.toLowerCase()) ??
    pool.find((v) => v.languageCode.toLowerCase().replace(/[_-].*$/, "") === base) ??
    pool.find((v) => v.locale === "ar") ??
    pool.find((v) => v.languageCode.toLowerCase().startsWith("ar")) ??
    null;

  if (!chosen) return NOT_READY;
  const ready = chosen.approvalStatus === "APPROVED";
  return {
    ready,
    reason: ready ? null : "NOT_APPROVED",
    languageCode: chosen.languageCode,
    approvalStatus: chosen.approvalStatus,
    locale: chosen.locale,
    providerTemplateName: chosen.providerTemplateName,
    componentsSchema: chosen.componentsSchema,
    rejectionReason: chosen.rejectionReason,
    lastSyncedAt: chosen.lastSyncedAt,
  };
}

/** The same answer, read from the database  the form every runtime caller uses. */
export async function getTemplateReadiness(templateId: string, locale: string): Promise<VariantReadiness> {
  if (!process.env.DATABASE_URL) return NOT_READY;
  const variants = await prisma.whatsappTemplateVariant
    .findMany({
      where: { templateId, provider: META_PROVIDER },
      select: { languageCode: true, locale: true, approvalStatus: true, providerTemplateName: true, componentsSchema: true, rejectionReason: true, lastSyncedAt: true },
    })
    .catch(() => []);
  return resolveVariantForLocale(variants as VariantRow[], locale);
}

/** Which locales a template can actually be sent in  approved variants only. */
export async function approvedLocalesFor(templateId: string): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const variants = await prisma.whatsappTemplateVariant
    .findMany({ where: { templateId, provider: META_PROVIDER, approvalStatus: "APPROVED" }, select: { locale: true, languageCode: true } })
    .catch(() => []);
  const out = new Set<string>();
  for (const v of variants) {
    const locale = v.locale ?? localeFromMetaLanguage(v.languageCode);
    if (locale) out.add(locale);
  }
  return [...out];
}
