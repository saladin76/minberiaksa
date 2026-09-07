import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { LOCALES, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { createOrUpdateCampaignLink } from "@/lib/marketing/campaign-links/campaign-link-registry-service";
import type { CommunicationChannelId } from "./communication-runtime-types";

/**
 * Connects CommunicationCampaigns to real donation outcomes via tracking links.
 *
 * Attribution is NEVER fabricated: it is derived from the donation `attribution` UTM snapshot captured
 * at checkout. A donation is matched to a campaign only when its attribution carries the campaign's
 * UTM values. Failed donation attempts are real rows (DonationStatus = FAILED) — if none exist we show
 * "unavailable", never a fake 0. Visits are not stored, so they are always reported as unavailable.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

export const COMMUNICATION_MEDIUM = "communication";

/** WhatsApp campaign → whatsapp, Email → email, SMS → sms. */
export function sourceForChannel(channel: string): "whatsapp" | "email" | "sms" | null {
  if (channel === "WHATSAPP") return "whatsapp";
  if (channel === "EMAIL") return "email";
  if (channel === "SMS") return "sms";
  return null;
}

export type TrackingLink = {
  id: string;
  url: string;
  source: string;
  medium: string;
  utmCampaign: string;
  locale: string | null;
  templateId: string | null;
  status: string;
  createdAt: string;
};

export async function listTrackingLinks(campaignId: string): Promise<TrackingLink[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await prisma.communicationCampaignTrackingLink
    .findMany({ where: { campaignId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 50 })
    .catch(() => []);
  return rows.map((r) => ({ id: r.id, url: r.url, source: r.source, medium: r.medium, utmCampaign: r.utmCampaign, locale: r.locale ?? null, templateId: r.templateId ?? null, status: r.status, createdAt: r.createdAt.toISOString() }));
}

/** Build the UTM values for a communication tracking link from REAL campaign data (no fake examples). */
export function buildTrackingParams(campaign: { id: string; channel: string }, opts: { locale?: string | null; templateId?: string | null } = {}) {
  const source = sourceForChannel(campaign.channel);
  return {
    utm_source: source ?? campaign.channel.toLowerCase(),
    utm_medium: COMMUNICATION_MEDIUM,
    utm_campaign: campaign.id,
    utm_content: opts.templateId ?? undefined,
    locale: opts.locale && isValidLocale(opts.locale) ? opts.locale : undefined,
  };
}

/** Append UTM params to a base donation URL (keeps any existing query intact). */
export function decorateUrl(baseUrl: string, params: Record<string, string | undefined>): string {
  try {
    const u = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    // Not a valid absolute URL — return as-is so we never invent a fake URL.
    return baseUrl;
  }
}

/**
 * Attach a tracking link to a campaign. When `createInGenerator` is true and a base URL is given, a
 * real MarketingCampaignLink is created via the existing Link Generator infrastructure (reused, not
 * duplicated). Otherwise an existing link URL is recorded as-is.
 */
export async function attachTrackingLink(
  campaign: { id: string; channel: string },
  input: { baseUrl?: string | null; existingUrl?: string | null; linkId?: string | null; locale?: string | null; templateId?: string | null; createInGenerator?: boolean },
  actor: Actor
): Promise<{ ok: true; data: TrackingLink } | { ok: false; status: number; error: string }> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  const source = sourceForChannel(campaign.channel) ?? campaign.channel.toLowerCase();
  const params = buildTrackingParams(campaign, { locale: input.locale, templateId: input.templateId });

  let url = (input.existingUrl ?? "").trim();
  let linkId: string | null = input.linkId ?? null;

  if (input.createInGenerator && input.baseUrl?.trim()) {
    url = decorateUrl(input.baseUrl.trim(), params);
    try {
      const link = await createOrUpdateCampaignLink({
        name: `تواصل — ${source} — ${campaign.id}`,
        platform: source,
        channel: source,
        url,
        utmSource: params.utm_source,
        utmMedium: params.utm_medium,
        utmCampaign: params.utm_campaign,
        utmContent: params.utm_content ?? null,
        campaignId: campaign.id,
        messageVariant: input.templateId ?? null,
        locale: input.locale ?? null,
        createdBy: actor.actorId ?? null,
        raw: { origin: "communication-campaign", communicationCampaignId: campaign.id },
      });
      linkId = (link as { id?: string; urlHash?: string })?.id ?? (link as { urlHash?: string })?.urlHash ?? null;
    } catch (error) {
      console.error("attachTrackingLink: generator create failed", error);
      // Fall through — we still record the decorated URL association so reporting works.
    }
  }

  if (!url) return { ok: false, status: 400, error: "أدخل رابطًا صالحًا أو رابط تبرع لإنشاء رابط تتبع." };

  try {
    const row = await prisma.communicationCampaignTrackingLink.create({
      data: { campaignId: campaign.id, linkId, url, source, medium: COMMUNICATION_MEDIUM, utmCampaign: campaign.id, locale: input.locale ?? null, templateId: input.templateId ?? null, status: "ACTIVE" },
    });
    await writeAuditLog({
      actorId: actor.actorId ?? undefined,
      actorName: actor.actorName ?? undefined,
      actorRole: actor.actorRole ?? "ADMIN",
      action: "communication.campaign.tracking-link.attach",
      messageAr: `ربط رابط تتبع بحملة تواصل`,
      messageEn: `Attached tracking link to communication campaign`,
      entityType: "CommunicationCampaign",
      entityId: campaign.id,
      metadata: { source, linkId, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: { id: row.id, url: row.url, source: row.source, medium: row.medium, utmCampaign: row.utmCampaign, locale: row.locale ?? null, templateId: row.templateId ?? null, status: row.status, createdAt: row.createdAt.toISOString() } };
  } catch (error) {
    console.error("attachTrackingLink failed", error);
    return { ok: false, status: 500, error: "تعذّر ربط رابط التتبع." };
  }
}

// ─────────────────────────── Attribution reporting ───────────────────────────

function attr(d: { attribution: unknown }): Record<string, unknown> {
  return (d.attribution && typeof d.attribution === "object" ? d.attribution : {}) as Record<string, unknown>;
}
function str(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function valueUSD(d: { amountUSD: number | null; totalAmount: number; amount: number }): number {
  return d.amountUSD ?? d.totalAmount ?? d.amount ?? 0;
}

type DonationRow = { id: string; status: string; amount: number; amountUSD: number | null; totalAmount: number; attribution: unknown; donorCountryCode?: string | null };

const COMM_SOURCES = new Set(["whatsapp", "email", "sms"]);

/** Fetch a bounded window of donations that carry a communication-medium attribution. */
async function loadCommunicationDonations(sinceDays = 180): Promise<DonationRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.donation
    .findMany({ where: { createdAt: { gte: since } }, select: { id: true, status: true, amount: true, amountUSD: true, totalAmount: true, attribution: true }, orderBy: { createdAt: "desc" }, take: 8000 })
    .catch(() => []);
  return rows.filter((d) => str(attr(d), "utm_medium") === COMMUNICATION_MEDIUM);
}

export type AttributionConfidence = "دقيق" | "جزئي" | "غير متاح";

export type CampaignDonationReport = {
  hasTrackingLink: boolean;
  confidence: AttributionConfidence;
  successful: { count: number; valueUSD: number };
  failed: { count: number; valueUSD: number } | null; // null = failed attempts not applicable/none captured for this campaign
  averageUSD: number | null;
  bestLanguage: { locale: string; label: string; valueUSD: number } | null;
  visits: null; // visits are not stored
  links: TrackingLink[];
};

/** Per-campaign donation attribution. Campaign-level (دقيق) when utm_campaign matches; else channel-level (جزئي). */
export async function getCampaignDonationReport(campaign: { id: string; channel: string }): Promise<CampaignDonationReport> {
  const links = await listTrackingLinks(campaign.id);
  const source = sourceForChannel(campaign.channel);
  if (links.length === 0) {
    return { hasTrackingLink: false, confidence: "غير متاح", successful: { count: 0, valueUSD: 0 }, failed: null, averageUSD: null, bestLanguage: null, visits: null, links: [] };
  }

  const donations = await loadCommunicationDonations();
  const campaignMatch = donations.filter((d) => str(attr(d), "utm_campaign") === campaign.id);
  const usingCampaignLevel = campaignMatch.length > 0;
  // Fall back to channel-level attribution (same source) only when no campaign-level match exists.
  const matched = usingCampaignLevel ? campaignMatch : donations.filter((d) => source && str(attr(d), "utm_source") === source);

  const paid = matched.filter((d) => d.status === "PAID");
  const failed = matched.filter((d) => d.status === "FAILED");
  const successValue = paid.reduce((s, d) => s + valueUSD(d), 0);
  const failedValue = failed.reduce((s, d) => s + valueUSD(d), 0);

  // Best language by successful donation value (from the attribution locale).
  const byLocale = new Map<string, number>();
  for (const d of paid) {
    const loc = str(attr(d), "locale");
    if (loc && isValidLocale(loc)) byLocale.set(loc, (byLocale.get(loc) ?? 0) + valueUSD(d));
  }
  const bestLangEntry = [...byLocale.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    hasTrackingLink: true,
    confidence: usingCampaignLevel ? "دقيق" : matched.length > 0 ? "جزئي" : "غير متاح",
    successful: { count: paid.length, valueUSD: Math.round(successValue) },
    failed: failed.length > 0 ? { count: failed.length, valueUSD: Math.round(failedValue) } : null,
    averageUSD: paid.length > 0 ? Math.round(successValue / paid.length) : null,
    bestLanguage: bestLangEntry ? { locale: bestLangEntry[0], label: LOCALES[bestLangEntry[0] as SupportedLocale]?.label ?? bestLangEntry[0], valueUSD: Math.round(bestLangEntry[1]) } : null,
    visits: null,
    links,
  };
}

// ─────────────────────────── Communication-wide donation overview (reports page) ───────────────────────────

export type CommunicationDonationOverview = {
  hasData: boolean;
  byChannel: { source: string; label: string; count: number; valueUSD: number }[];
  byLanguage: { locale: string; label: string; count: number; valueUSD: number }[];
  bestCampaigns: { campaignId: string; name: string; count: number; valueUSD: number }[];
  campaignsWithoutLinks: { id: string; name: string; channel: string }[];
  failed: { count: number; valueUSD: number } | null;
};

const SOURCE_LABEL: Record<string, string> = { whatsapp: "واتساب", email: "إيميل", sms: "رسائل قصيرة" };

export async function getCommunicationDonationOverview(): Promise<CommunicationDonationOverview> {
  const empty: CommunicationDonationOverview = { hasData: false, byChannel: [], byLanguage: [], bestCampaigns: [], campaignsWithoutLinks: [], failed: null };
  if (!process.env.DATABASE_URL) return empty;

  const [donations, campaigns, links] = await Promise.all([
    loadCommunicationDonations(),
    prisma.communicationCampaign.findMany({ where: { status: { notIn: ["ARCHIVED"] } }, select: { id: true, name: true, channel: true }, take: 300 }).catch(() => []),
    prisma.communicationCampaignTrackingLink.findMany({ where: { status: "ACTIVE" }, select: { campaignId: true }, take: 2000 }).catch(() => []),
  ]);

  const paid = donations.filter((d) => d.status === "PAID");
  const failedAll = donations.filter((d) => d.status === "FAILED");
  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const linkedCampaignIds = new Set(links.map((l) => l.campaignId));

  const byChannel = new Map<string, { count: number; valueUSD: number }>();
  const byLanguage = new Map<string, { count: number; valueUSD: number }>();
  const byCampaign = new Map<string, { count: number; valueUSD: number }>();
  for (const d of paid) {
    const a = attr(d);
    const src = str(a, "utm_source");
    if (src && COMM_SOURCES.has(src)) {
      const c = byChannel.get(src) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += valueUSD(d); byChannel.set(src, c);
    }
    const loc = str(a, "locale");
    if (loc && isValidLocale(loc)) {
      const c = byLanguage.get(loc) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += valueUSD(d); byLanguage.set(loc, c);
    }
    const camp = str(a, "utm_campaign");
    if (camp && nameById.has(camp)) {
      const c = byCampaign.get(camp) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += valueUSD(d); byCampaign.set(camp, c);
    }
  }

  const hasData = paid.length > 0 || links.length > 0;
  return {
    hasData,
    byChannel: [...byChannel.entries()].map(([source, v]) => ({ source, label: SOURCE_LABEL[source] ?? source, count: v.count, valueUSD: Math.round(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD),
    byLanguage: [...byLanguage.entries()].map(([locale, v]) => ({ locale, label: LOCALES[locale as SupportedLocale]?.label ?? locale, count: v.count, valueUSD: Math.round(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD),
    bestCampaigns: [...byCampaign.entries()].map(([campaignId, v]) => ({ campaignId, name: nameById.get(campaignId) ?? campaignId, count: v.count, valueUSD: Math.round(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD).slice(0, 8),
    campaignsWithoutLinks: campaigns.filter((c) => !linkedCampaignIds.has(c.id)).slice(0, 12),
    failed: failedAll.length > 0 ? { count: failedAll.length, valueUSD: Math.round(failedAll.reduce((s, d) => s + valueUSD(d), 0)) } : null,
  };
}
