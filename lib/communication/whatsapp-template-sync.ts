import "server-only";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { listAllTemplates } from "./providers/meta-whatsapp/templates";

export const META_PROVIDER = "META_WHATSAPP";

export type SyncSummary = {
  ok: boolean;
  fetched: number;
  matchedTemplates: number;
  variantsUpserted: number;
  variantsRemoved: number;
  wabasSynced: number;
  unmatchedNames: string[];
  reason?: string;
  detail?: string;
};

export function localeFromMetaLanguage(language: string): SupportedLocale | null {
  const base = String(language ?? "").trim().toLowerCase().replace(/[_-].*$/, "");
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? (base as SupportedLocale) : null;
}

export function normalizeApprovalStatus(status: string): string {
  const value = String(status ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

function foldName(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function statusRank(status: string): number {
  const s = normalizeApprovalStatus(status);
  if (s === "REJECTED" || s === "DISABLED") return 6;
  if (s === "PAUSED") return 5;
  if (s === "PENDING" || s === "IN_REVIEW") return 4;
  if (s === "MISSING_IN_WABA") return 3;
  if (s === "UNKNOWN") return 2;
  if (s === "APPROVED") return 1;
  return 2;
}

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

async function activeWabaIds(explicit?: string | null): Promise<string[]> {
  if (explicit?.trim()) return [explicit.trim()];
  const rows = await prisma.communicationSender.findMany({
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
  return [...new Set(rows.map((row) => row.businessAccountId?.trim()).filter(Boolean) as string[])];
}

/**
 * Meta -> DB provider truth.
 *
 * Exact truth is stored per (template, WABA, language). The older WhatsappTemplateVariant table is
 * retained as a conservative aggregate for dashboards/backwards compatibility: a language is
 * APPROVED there only when every active WABA has that language approved.
 */
export async function syncMetaWhatsappTemplates(opts: {
  businessAccountId?: string | null;
  actor?: Actor;
} = {}): Promise<SyncSummary> {
  const summary: SyncSummary = {
    ok: false,
    fetched: 0,
    matchedTemplates: 0,
    variantsUpserted: 0,
    variantsRemoved: 0,
    wabasSynced: 0,
    unmatchedNames: [],
  };
  if (!process.env.DATABASE_URL) return { ...summary, reason: "DATABASE_UNAVAILABLE" };

  const wabas = await activeWabaIds(opts.businessAccountId);
  if (!wabas.length) return { ...summary, reason: "NO_ACTIVE_WABA", detail: "No active Meta WhatsApp sender has a WABA ID." };

  const locals = await prisma.whatsappTemplate.findMany({ select: { id: true, name: true } }).catch(() => []);
  const byFoldedName = new Map<string, string>();
  for (const local of locals) byFoldedName.set(foldName(local.name), local.id);

  const unmatched = new Set<string>();
  const touchedTemplates = new Set<string>();
  const now = new Date();

  for (const waba of wabas) {
    const remote = await listAllTemplates(waba);
    if (!remote.ok) return { ...summary, reason: remote.reason, detail: `${waba}: ${remote.detail ?? remote.reason}` };
    summary.wabasSynced += 1;
    summary.fetched += remote.templates.length;

    const keptByTemplate = new Map<string, string[]>();
    for (const row of remote.templates) {
      if (!row.name || !row.language) continue;
      const templateId = byFoldedName.get(foldName(row.name));
      if (!templateId) {
        unmatched.add(row.name);
        continue;
      }
      touchedTemplates.add(templateId);
      const kept = keptByTemplate.get(templateId) ?? [];
      kept.push(row.language);
      keptByTemplate.set(templateId, kept);

      const data = {
        providerTemplateName: row.name,
        providerTemplateId: row.id,
        languageCode: row.language,
        locale: localeFromMetaLanguage(row.language),
        approvalStatus: normalizeApprovalStatus(row.status),
        category: row.category,
        rejectionReason: row.rejectedReason,
        qualityRating: row.qualityScore,
        componentsSchema: (row.components ?? undefined) as never,
        lastSyncedAt: now,
      };
      const written = await prisma.whatsappTemplateWabaVariant.upsert({
        where: {
          templateId_provider_businessAccountId_languageCode: {
            templateId,
            provider: META_PROVIDER,
            businessAccountId: waba,
            languageCode: row.language,
          },
        },
        update: data,
        create: { templateId, provider: META_PROVIDER, businessAccountId: waba, ...data },
      }).catch((error: unknown) => {
        console.error("WABA variant upsert failed", error);
        return null;
      });
      if (written) summary.variantsUpserted += 1;
    }

    /* Reconcile every local template for this WABA, not only templates Meta returned. Otherwise a
       template deleted/disabled remotely can leave a stale APPROVED row forever. */
    for (const local of locals) {
      const keptLanguages = keptByTemplate.get(local.id) ?? [];
      const removed = await prisma.whatsappTemplateWabaVariant.deleteMany({
        where: {
          templateId: local.id,
          provider: META_PROVIDER,
          businessAccountId: waba,
          ...(keptLanguages.length ? { languageCode: { notIn: keptLanguages } } : {}),
        },
      }).catch(() => ({ count: 0 }));
      summary.variantsRemoved += removed.count;
      if (keptLanguages.length) touchedTemplates.add(local.id);
    }
  }

  summary.matchedTemplates = touchedTemplates.size;
  summary.unmatchedNames = [...unmatched].sort();

  // Rebuild conservative aggregate variants from exact WABA rows.
  for (const templateId of touchedTemplates) {
    const exact = await prisma.whatsappTemplateWabaVariant.findMany({
      where: { templateId, provider: META_PROVIDER, businessAccountId: { in: wabas } },
      select: {
        businessAccountId: true,
        providerTemplateName: true,
        providerTemplateId: true,
        languageCode: true,
        locale: true,
        approvalStatus: true,
        category: true,
        rejectionReason: true,
        qualityRating: true,
        componentsSchema: true,
        lastSyncedAt: true,
      },
    }).catch(() => []);

    const byLanguage = new Map<string, typeof exact>();
    for (const row of exact) {
      const list = byLanguage.get(row.languageCode) ?? [];
      list.push(row);
      byLanguage.set(row.languageCode, list);
    }

    const keptLanguages: string[] = [];
    for (const [languageCode, rows] of byLanguage) {
      keptLanguages.push(languageCode);
      const first = rows[0];
      if (!first) continue;
      const complete = new Set(rows.map((row) => row.businessAccountId)).size === wabas.length;
      const worst = rows.reduce((acc, row) => statusRank(row.approvalStatus) > statusRank(acc.approvalStatus) ? row : acc, first);
      const status = complete && rows.every((row) => normalizeApprovalStatus(row.approvalStatus) === "APPROVED")
        ? "APPROVED"
        : complete
          ? normalizeApprovalStatus(worst.approvalStatus)
          : "MISSING_IN_WABA";
      await prisma.whatsappTemplateVariant.upsert({
        where: { templateId_provider_languageCode: { templateId, provider: META_PROVIDER, languageCode } },
        update: {
          providerTemplateName: first.providerTemplateName,
          providerTemplateId: first.providerTemplateId,
          locale: first.locale,
          approvalStatus: status,
          category: first.category,
          rejectionReason: !complete
            ? `Template/language exists in ${new Set(rows.map((row) => row.businessAccountId)).size}/${wabas.length} active WABAs`
            : rows.map((row) => row.rejectionReason).find(Boolean) ?? null,
          qualityRating: worst.qualityRating,
          componentsSchema: first.componentsSchema as never,
          lastSyncedAt: now,
        },
        create: {
          templateId,
          provider: META_PROVIDER,
          providerTemplateName: first.providerTemplateName,
          providerTemplateId: first.providerTemplateId,
          languageCode,
          locale: first.locale,
          approvalStatus: status,
          category: first.category,
          rejectionReason: !complete
            ? `Template/language exists in ${new Set(rows.map((row) => row.businessAccountId)).size}/${wabas.length} active WABAs`
            : rows.map((row) => row.rejectionReason).find(Boolean) ?? null,
          qualityRating: worst.qualityRating,
          componentsSchema: first.componentsSchema as never,
          lastSyncedAt: now,
        },
      }).catch((error: unknown) => console.error("aggregate variant upsert failed", error));
    }

    const removed = await prisma.whatsappTemplateVariant.deleteMany({
      where: { templateId, provider: META_PROVIDER, languageCode: { notIn: keptLanguages } },
    }).catch(() => ({ count: 0 }));
    summary.variantsRemoved += removed.count;
  }

  summary.ok = true;
  await writeAuditLog({
    actorId: opts.actor?.actorId ?? undefined,
    actorName: opts.actor?.actorName ?? undefined,
    actorRole: opts.actor?.actorRole ?? "SYSTEM",
    action: "communication.whatsapp.templates.sync",
    messageAr: `مزامنة قوالب واتساب من Meta عبر ${summary.wabasSynced} WABA — ${summary.variantsUpserted} نسخة WABA/لغة`,
    messageEn: `WhatsApp template sync across ${summary.wabasSynced} WABA(s); ${summary.variantsUpserted} WABA/language variant(s)`,
    entityType: "WhatsappTemplate",
    metadata: { ...summary, externalCall: true },
    stream: "TEAM",
  }).catch(() => {});
  return summary;
}

export type VariantReadiness = {
  ready: boolean;
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
  ready: false,
  reason: "NO_VARIANT",
  languageCode: null,
  approvalStatus: null,
  locale: null,
  providerTemplateName: null,
  componentsSchema: null,
  rejectionReason: null,
  lastSyncedAt: null,
};

export type VariantRow = {
  languageCode: string;
  locale: string | null;
  approvalStatus: string;
  providerTemplateName: string;
  componentsSchema: unknown;
  rejectionReason: string | null;
  lastSyncedAt: Date;
};

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
  const ready = normalizeApprovalStatus(chosen.approvalStatus) === "APPROVED";
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

/**
 * Runtime readiness. When a WABA is known (normal multi-sender send), truth is read only from that
 * WABA. Without one, the conservative aggregate is used for dashboard/preflight compatibility.
 */
export async function getTemplateReadiness(
  templateId: string,
  locale: string,
  businessAccountId?: string | null,
): Promise<VariantReadiness> {
  if (!process.env.DATABASE_URL) return NOT_READY;
  if (businessAccountId) {
    const variants = await prisma.whatsappTemplateWabaVariant.findMany({
      where: { templateId, provider: META_PROVIDER, businessAccountId },
      select: {
        languageCode: true,
        locale: true,
        approvalStatus: true,
        providerTemplateName: true,
        componentsSchema: true,
        rejectionReason: true,
        lastSyncedAt: true,
      },
    }).catch(() => []);
    return resolveVariantForLocale(variants as VariantRow[], locale);
  }
  const variants = await prisma.whatsappTemplateVariant.findMany({
    where: { templateId, provider: META_PROVIDER },
    select: {
      languageCode: true,
      locale: true,
      approvalStatus: true,
      providerTemplateName: true,
      componentsSchema: true,
      rejectionReason: true,
      lastSyncedAt: true,
    },
  }).catch(() => []);
  return resolveVariantForLocale(variants as VariantRow[], locale);
}

export async function approvedLocalesFor(templateId: string, businessAccountId?: string | null): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const variants = businessAccountId
    ? await prisma.whatsappTemplateWabaVariant.findMany({
        where: { templateId, provider: META_PROVIDER, businessAccountId, approvalStatus: "APPROVED" },
        select: { locale: true, languageCode: true },
      }).catch(() => [])
    : await prisma.whatsappTemplateVariant.findMany({
        where: { templateId, provider: META_PROVIDER, approvalStatus: "APPROVED" },
        select: { locale: true, languageCode: true },
      }).catch(() => []);
  const out = new Set<string>();
  for (const v of variants) {
    const locale = v.locale ?? localeFromMetaLanguage(v.languageCode);
    if (locale) out.add(locale);
  }
  return [...out];
}
