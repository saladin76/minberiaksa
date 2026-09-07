import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";

/**
 * Read layer for the Template Center. Presents the existing WhatsappTemplate / EmailTemplate rows
 * (and EmailLayout) as channel-grouped "template groups" with a derived kind (SYSTEM vs CAMPAIGN),
 * language variants, status, and where each system template is used. It NEVER writes, sends, or
 * exposes provider secrets, and it does not change rendering or campaign send behavior.
 *
 * Data model (no new group model): a "group" is one template row; its "language variants" are the
 * base Arabic content plus the locale keys inside `translations`.
 */

export type TemplateChannel = "WHATSAPP" | "EMAIL" | "SMS";
export type TemplateKind = "SYSTEM" | "CAMPAIGN";

export type TemplateUsage = { event: string; label: string; enabled: boolean };

export type TemplateGroup = {
  id: string;
  name: string;
  channel: TemplateChannel;
  kind: TemplateKind;
  status: string;
  purpose: string | null;
  locales: SupportedLocale[];
  missingLocales: SupportedLocale[];
  usage: TemplateUsage[];
  approvalStatus: string | null;
  hasLayout: boolean;
  updatedAt: string;
};

export type TemplateCenterSummary = {
  systemCount: number;
  campaignCount: number;
  missingLanguageGroups: number;
  needsReviewCount: number;
};

export type EmailLayoutSummary = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isDefault: boolean;
  unsubscribePlaceholder: boolean;
  updatedAt: string;
};

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  DONATION_PAID: "نجاح تبرع",
  DONATION_FAILED: "فشل تبرع",
  FIRST_DONATION: "أول تبرع",
  USER_REGISTERED: "حساب جديد",
  SUBSCRIPTION_CREATED: "اشتراك جديد",
  SUBSCRIPTION_PAYMENT: "دفعة اشتراك",
  SUBSCRIPTION_CANCELLED: "إلغاء اشتراك",
  DONATION_LAPSED: "تذكير بالتبرّع",
};

function localesFrom(translations: unknown): SupportedLocale[] {
  const set = new Set<SupportedLocale>([DEFAULT_LOCALE]);
  if (translations && typeof translations === "object") {
    for (const key of Object.keys(translations as Record<string, unknown>)) {
      if (isValidLocale(key)) set.add(key);
    }
  }
  return SUPPORTED_LOCALES.filter((l) => set.has(l));
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status ?? "DRAFT").toUpperCase();
  return ["DRAFT", "READY", "NEEDS_REVIEW", "ARCHIVED", "APPROVED"].includes(s) ? s : "DRAFT";
}

export async function getTemplateCenter(): Promise<{ summary: TemplateCenterSummary; groups: TemplateGroup[]; layouts: EmailLayoutSummary[] }> {
  const empty = { summary: { systemCount: 0, campaignCount: 0, missingLanguageGroups: 0, needsReviewCount: 0 }, groups: [], layouts: [] };
  if (!process.env.DATABASE_URL) return empty;

  const [waRows, emailRows, triggers, layoutRows] = await Promise.all([
    prisma.whatsappTemplate
      .findMany({ orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true, translations: true, kind: true, status: true, purpose: true, category: true, channel: true, approvalStatus: true } })
      .catch(() => []),
    prisma.emailTemplate
      .findMany({ orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true, translations: true, kind: true, status: true, purpose: true, layoutId: true } })
      .catch(() => []),
    prisma.messageTrigger.findMany({ select: { templateId: true, event: true, enabled: true } }).catch(() => []),
    prisma.emailLayout.findMany({ orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 100 }).catch(() => []),
  ]);

  const usageByTemplate = new Map<string, TemplateUsage[]>();
  const triggerTemplateIds = new Set<string>();
  for (const t of triggers) {
    triggerTemplateIds.add(t.templateId);
    const list = usageByTemplate.get(t.templateId) ?? [];
    list.push({ event: t.event, label: TRIGGER_EVENT_LABELS[t.event] ?? t.event, enabled: t.enabled });
    usageByTemplate.set(t.templateId, list);
  }

  const enabledCount = SUPPORTED_LOCALES.length;
  const groups: TemplateGroup[] = [];

  const deriveKind = (rowKind: string | null | undefined, id: string): TemplateKind =>
    rowKind === "SYSTEM" || triggerTemplateIds.has(id) ? "SYSTEM" : "CAMPAIGN";

  for (const t of waRows) {
    const locales = localesFrom(t.translations);
    const channel: TemplateChannel = (t.channel ?? "").toUpperCase() === "SMS" ? "SMS" : "WHATSAPP";
    groups.push({
      id: t.id,
      name: t.name,
      channel,
      kind: deriveKind(t.kind, t.id),
      status: normalizeStatus(t.status),
      purpose: t.purpose ?? t.category ?? null,
      locales,
      missingLocales: SUPPORTED_LOCALES.filter((l) => !locales.includes(l)),
      usage: usageByTemplate.get(t.id) ?? [],
      approvalStatus: t.approvalStatus ?? null,
      hasLayout: false,
      updatedAt: (t as { updatedAt?: Date }).updatedAt?.toISOString?.() ?? new Date().toISOString(),
    });
  }

  for (const t of emailRows) {
    const locales = localesFrom(t.translations);
    groups.push({
      id: t.id,
      name: t.name,
      channel: "EMAIL",
      kind: deriveKind(t.kind, t.id),
      status: normalizeStatus(t.status),
      purpose: t.purpose ?? null,
      locales,
      missingLocales: SUPPORTED_LOCALES.filter((l) => !locales.includes(l)),
      usage: usageByTemplate.get(t.id) ?? [],
      approvalStatus: null,
      hasLayout: !!t.layoutId,
      updatedAt: (t as { updatedAt?: Date }).updatedAt?.toISOString?.() ?? new Date().toISOString(),
    });
  }

  const active = groups.filter((g) => g.status !== "ARCHIVED");
  const summary: TemplateCenterSummary = {
    systemCount: active.filter((g) => g.kind === "SYSTEM").length,
    campaignCount: active.filter((g) => g.kind === "CAMPAIGN").length,
    missingLanguageGroups: active.filter((g) => g.locales.length < enabledCount).length,
    needsReviewCount: active.filter((g) => g.status === "NEEDS_REVIEW").length,
  };

  const layouts: EmailLayoutSummary[] = layoutRows.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description ?? null,
    status: l.status,
    isDefault: l.isDefault,
    unsubscribePlaceholder: l.unsubscribePlaceholder,
    updatedAt: l.updatedAt.toISOString(),
  }));

  return { summary, groups, layouts };
}

export const LOCALE_LABEL = (l: SupportedLocale) => LOCALES[l]?.label ?? l;
