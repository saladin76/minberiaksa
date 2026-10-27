import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { LOCALES, isValidLocale, type SupportedLocale } from "@/lib/locales";
import {
  buildUniqueCampaignUtmAliases,
  campaignUtmLinksFromWhatsAppTemplates,
  campaignsNeedingTrackedTemplate,
  isCommunicationUtmMedium,
  resolveCommunicationCampaignId,
  type CampaignUtmLink,
} from "./campaign-attribution-matching";

/**
 * Connects CommunicationCampaigns to real donation outcomes via tracking links.
 *
 * Attribution is NEVER fabricated: it is derived from the donation `attribution` UTM snapshot captured
 * at checkout. A donation is matched to a campaign only when its attribution carries the campaign's
 * UTM values. Failed donation attempts are real rows (DonationStatus = FAILED)  if none exist we show
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
    utm_id: campaign.id,
    utm_content: opts.templateId ?? undefined,
    locale: opts.locale && isValidLocale(opts.locale) ? opts.locale : undefined,
  };
}

/** Append campaign-specific UTM params to a donation URL (keeps other query values intact). */
export function decorateUrl(baseUrl: string, params: Record<string, string | undefined>): string {
  try {
    const u = new URL(baseUrl, process.env.NEXT_PUBLIC_SITE_URL || "https://minberiaksa.org");
    if (u.protocol !== "http:" && u.protocol !== "https:") return baseUrl;
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    // Not a valid absolute URL  return as-is so we never invent a fake URL.
    return baseUrl;
  }
}

/**
 * Attach a tracking link to a campaign. Existing URLs are decorated too, so a
 * generic `utm_campaign` cannot silently survive as the tracking identity.
 * When `createInGenerator` is true a real MarketingCampaignLink is also created.
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
      const { createOrUpdateCampaignLink } = await import("@/lib/marketing/campaign-links/campaign-link-registry-service");
      const link = await createOrUpdateCampaignLink({
        name: `تواصل  ${source}  ${campaign.id}`,
        platform: source,
        channel: source,
        url,
        utmSource: params.utm_source,
        utmMedium: params.utm_medium,
        utmCampaign: params.utm_campaign,
        utmId: params.utm_id,
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
      // Fall through  we still record the decorated URL association so reporting works.
    }
  } else if (url) {
    url = decorateUrl(url, params);
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
function valueUSD(d: DonationRow): number | null {
  if (typeof d.amountUSD === "number" && Number.isFinite(d.amountUSD)) return d.amountUSD;
  return d.currency === "USD" && Number.isFinite(d.amount) ? d.amount : null;
}
function isPaid(d: DonationRow): boolean { return d.status === "PAID" && !!d.paidAt; }
function cents(value: number): number { return Math.round(value * 100) / 100; }

type DonationRow = { id: string; status: string; paidAt: Date | null; amount: number; currency: string; amountUSD: number | null; totalAmount: number; attribution: unknown; donorCountryCode?: string | null };

const COMM_SOURCES = new Set(["whatsapp", "email", "sms"]);

/** Walk every page. A busy checkout must not push older campaign income out of a display cap.
 * Read failures reject the report instead of being represented as zero revenue. */
export async function loadCommunicationDonations(): Promise<DonationRow[]> {
  if (!process.env.DATABASE_URL) throw new Error("COMMUNICATION_ATTRIBUTION_DATABASE_UNAVAILABLE");
  const donations: DonationRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows: DonationRow[] = await prisma.donation.findMany({
      where: { status: { in: ["PAID", "FAILED"] }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, status: true, paidAt: true, amount: true, currency: true, amountUSD: true, totalAmount: true, attribution: true },
      orderBy: { id: "asc" }, take: 1000,
    });
    donations.push(...rows.filter((d) => isCommunicationUtmMedium(attr(d).utm_medium)));
    if (rows.length < 1000) break;
    const next = rows.at(-1)?.id;
    if (!next || next === cursor) throw new Error("COMMUNICATION_ATTRIBUTION_CURSOR_STALLED");
    cursor = next;
  }
  return donations;
}

/** Include archived links when checking uniqueness: an old sent link can still
 * be the source of a donation after its campaign was archived. */
async function loadCampaignUtmLinks(): Promise<CampaignUtmLink[]> {
  if (!process.env.DATABASE_URL) return [];
  const [rows, campaigns] = await Promise.all([
    prisma.communicationCampaignTrackingLink.findMany({
      select: { campaignId: true, url: true, source: true, medium: true },
      take: 10_000,
    }),
    prisma.communicationCampaign.findMany({
      where: { channel: "WHATSAPP", templateGroupId: { not: null } },
      select: { id: true, channel: true, templateGroupId: true },
      take: 10_000,
    }),
  ]);
  // Do not claim an alias is unique when a campaign/link scan reached its safety bound.
  if (rows.length >= 10_000 || campaigns.length >= 10_000) throw new Error("COMMUNICATION_ATTRIBUTION_LINK_SCAN_INCOMPLETE");

  const templateIds = [...new Set(campaigns.map((campaign) => campaign.templateGroupId).filter((id): id is string => Boolean(id)))];
  let templateLinks: CampaignUtmLink[] = [];
  if (templateIds.length) {
    const variants = await prisma.whatsappTemplateWabaVariant.findMany({
      where: { provider: "META_WHATSAPP", templateId: { in: templateIds } },
      select: { templateId: true, componentsSchema: true },
      take: 20_000,
    });
    // A truncated scan cannot establish alias uniqueness.
    if (variants.length >= 20_000) throw new Error("COMMUNICATION_ATTRIBUTION_TEMPLATE_SCAN_INCOMPLETE");
    {
      templateLinks = campaignUtmLinksFromWhatsAppTemplates(
        campaigns.map((campaign) => ({ campaignId: campaign.id, channel: campaign.channel, templateId: campaign.templateGroupId })),
        variants,
      );
    }
  }
  return [...rows, ...templateLinks];
}

export type AttributionConfidence = "دقيق" | "جزئي" | "غير متاح";

export type CampaignDonationReport = {
  hasTrackingLink: boolean;
  confidence: AttributionConfidence;
  successful: { count: number; valueUSD: number };
  failed: { count: number; valueUSD: number } | null; // null = failed attempts not applicable/none captured for this campaign
  unpricedPaidCount: number;
  averageUSD: number | null;
  bestLanguage: { locale: string; label: string; valueUSD: number } | null;
  visits: null; // visits are not stored
  links: TrackingLink[];
};

/** Per-campaign donation attribution. A generic UTM is credited only when a
 * registered link maps it unambiguously to this one campaign. */
export async function getCampaignDonationReport(campaign: { id: string; channel: string }): Promise<CampaignDonationReport> {
  const [links, allLinks, donations] = await Promise.all([
    listTrackingLinks(campaign.id),
    loadCampaignUtmLinks(),
    loadCommunicationDonations(),
  ]);
  const aliases = buildUniqueCampaignUtmAliases(allLinks);
  const campaignIds = new Set([campaign.id]);
  const exactMatches = donations.filter((d) => {
    const a = attr(d);
    return str(a, "utm_campaign") === campaign.id ||
      str(a, "campaign_id") === campaign.id || str(a, "utm_id") === campaign.id;
  });
  const matched = donations.filter((d) =>
    resolveCommunicationCampaignId(attr(d), campaignIds, aliases) === campaign.id,
  );
  const usingExactCampaignId = matched.length > 0 && exactMatches.length === matched.length;

  const paid = matched.filter((d) => isPaid(d));
  const failed = matched.filter((d) => d.status === "FAILED");
  const successValue = paid.reduce((s, d) => s + (valueUSD(d) ?? 0), 0);
  const failedValue = failed.reduce((s, d) => s + (valueUSD(d) ?? 0), 0);

  // Best language by successful donation value (from the attribution locale).
  const byLocale = new Map<string, number>();
  for (const d of paid) {
    const loc = str(attr(d), "locale") ?? str(attr(d), "language");
    if (loc && isValidLocale(loc)) byLocale.set(loc, (byLocale.get(loc) ?? 0) + (valueUSD(d) ?? 0));
  }
  const bestLangEntry = [...byLocale.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    hasTrackingLink: links.length > 0,
    confidence: usingExactCampaignId ? "دقيق" : matched.length > 0 ? "جزئي" : "غير متاح",
    successful: { count: paid.length, valueUSD: cents(successValue) },
    failed: failed.length > 0 ? { count: failed.length, valueUSD: cents(failedValue) } : null,
    unpricedPaidCount: paid.filter(d => valueUSD(d) === null).length,
    averageUSD: paid.length > 0 && paid.every(d => valueUSD(d) !== null) ? cents(successValue / paid.length) : null,
    bestLanguage: bestLangEntry ? { locale: bestLangEntry[0], label: LOCALES[bestLangEntry[0] as SupportedLocale]?.label ?? bestLangEntry[0], valueUSD: cents(bestLangEntry[1]) } : null,
    visits: null,
    links,
  };
}

// ─────────────────────────── Communication-wide donation overview (reports page) ───────────────────────────

export type CampaignOutcomeMetric = {
  donationCount: number;
  revenue: number;
  failedDonationCount: number;
  unpricedPaidCount: number;
};
export type CampaignOutcomeSummary = {
  metrics: Map<string, CampaignOutcomeMetric>;
  staticTrackingCampaignIds: string[];
  unattributed: { donationCount: number; revenue: number; unpricedPaidCount: number };
};

/** Each settled donation is credited at most once. Shared historical aliases
 * remain visible as unattributed income rather than being assigned by guesswork. */
export async function getCampaignOutcomeSummary(campaignIds: readonly string[]): Promise<CampaignOutcomeSummary> {
  const ids = new Set(campaignIds.filter(Boolean));
  const metrics = new Map<string, CampaignOutcomeMetric>();
  const unattributed = { donationCount: 0, revenue: 0, unpricedPaidCount: 0 };
  if (!ids.size) return { metrics, unattributed, staticTrackingCampaignIds: [] };
  const [donations, trackingLinks] = await Promise.all([loadCommunicationDonations(), loadCampaignUtmLinks()]);
  const aliases = buildUniqueCampaignUtmAliases(trackingLinks);
  for (const donation of donations) {
    const campaignId = resolveCommunicationCampaignId(attr(donation), ids, aliases);
    if (!campaignId) {
      if (isPaid(donation)) {
        unattributed.donationCount++;
        const usd = valueUSD(donation);
        if (usd === null) unattributed.unpricedPaidCount++;
        else unattributed.revenue += usd;
      }
      continue;
    }
    const current = metrics.get(campaignId) ?? { donationCount: 0, revenue: 0, failedDonationCount: 0, unpricedPaidCount: 0 };
    if (isPaid(donation)) {
      current.donationCount++;
      const usd = valueUSD(donation);
      if (usd === null) current.unpricedPaidCount++;
      else current.revenue += usd;
    } else if (donation.status === "FAILED") current.failedDonationCount++;
    metrics.set(campaignId, current);
  }
  for (const metric of metrics.values()) metric.revenue = cents(metric.revenue);
  unattributed.revenue = cents(unattributed.revenue);
  return { metrics, unattributed, staticTrackingCampaignIds: campaignsNeedingTrackedTemplate(trackingLinks) };
}

export async function getCampaignOutcomeMetrics(campaignIds: readonly string[]): Promise<Map<string, CampaignOutcomeMetric>> {
  return (await getCampaignOutcomeSummary(campaignIds)).metrics;
}

/** Template reporting uses the same settled-payment and UTM rules as campaigns. */
export async function getTemplateDonationOutcome(template: { id: string; externalTemplateId: string | null }): Promise<CampaignOutcomeMetric> {
  const [campaigns, donations, links] = await Promise.all([
    prisma.communicationCampaign.findMany({ where: { channel: "WHATSAPP", templateGroupId: template.id }, select: { id: true } }),
    loadCommunicationDonations(), loadCampaignUtmLinks(),
  ]);
  const ids = new Set(campaigns.map(campaign => campaign.id));
  const templateIds = new Set([template.id, template.externalTemplateId].filter(Boolean));
  const aliases = buildUniqueCampaignUtmAliases(links);
  const result = { donationCount: 0, revenue: 0, failedDonationCount: 0, unpricedPaidCount: 0 };
  for (const donation of donations) {
    const attribution = attr(donation);
    const campaign = resolveCommunicationCampaignId(attribution, ids, aliases);
    const explicitCampaignId = ["utm_campaign", "utm_id", "campaign_id"].some(key => /^[a-f0-9]{24}$/i.test(str(attribution, key) ?? ""));
    const legacyTemplate = !explicitCampaignId && templateIds.has(str(attribution, "twilio_template_id"));
    if (!campaign && !legacyTemplate) continue;
    if (isPaid(donation)) {
      result.donationCount++;
      const usd = valueUSD(donation);
      if (usd === null) result.unpricedPaidCount++;
      else result.revenue += usd;
    } else if (donation.status === "FAILED") result.failedDonationCount++;
  }
  result.revenue = cents(result.revenue);
  return result;
}

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

  const [donations, campaigns, links, allLinks] = await Promise.all([
    loadCommunicationDonations(),
    prisma.communicationCampaign.findMany({ where: { status: { notIn: ["ARCHIVED"] } }, select: { id: true, name: true, channel: true }, take: 300 }),
    prisma.communicationCampaignTrackingLink.findMany({ where: { status: "ACTIVE" }, select: { campaignId: true }, take: 2000 }),
    loadCampaignUtmLinks(),
  ]);

  const paid = donations.filter((d) => isPaid(d));
  const failedAll = donations.filter((d) => d.status === "FAILED");
  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const linkedCampaignIds = new Set(links.map((l) => l.campaignId));

  const byChannel = new Map<string, { count: number; valueUSD: number }>();
  const byLanguage = new Map<string, { count: number; valueUSD: number }>();
  const byCampaign = new Map<string, { count: number; valueUSD: number }>();
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const aliases = buildUniqueCampaignUtmAliases(allLinks);
  for (const d of paid) {
    const a = attr(d);
    const src = str(a, "utm_source")?.toLowerCase();
    if (src && COMM_SOURCES.has(src)) {
      const c = byChannel.get(src) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += (valueUSD(d) ?? 0); byChannel.set(src, c);
    }
    const loc = str(a, "locale") ?? str(a, "language");
    if (loc && isValidLocale(loc)) {
      const c = byLanguage.get(loc) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += (valueUSD(d) ?? 0); byLanguage.set(loc, c);
    }
    const camp = resolveCommunicationCampaignId(a, campaignIds, aliases);
    if (camp && nameById.has(camp)) {
      const c = byCampaign.get(camp) ?? { count: 0, valueUSD: 0 };
      c.count += 1; c.valueUSD += (valueUSD(d) ?? 0); byCampaign.set(camp, c);
    }
  }

  const hasData = paid.length > 0 || links.length > 0;
  return {
    hasData,
    byChannel: [...byChannel.entries()].map(([source, v]) => ({ source, label: SOURCE_LABEL[source] ?? source, count: v.count, valueUSD: cents(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD),
    byLanguage: [...byLanguage.entries()].map(([locale, v]) => ({ locale, label: LOCALES[locale as SupportedLocale]?.label ?? locale, count: v.count, valueUSD: cents(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD),
    bestCampaigns: [...byCampaign.entries()].map(([campaignId, v]) => ({ campaignId, name: nameById.get(campaignId) ?? campaignId, count: v.count, valueUSD: cents(v.valueUSD) })).sort((a, b) => b.valueUSD - a.valueUSD).slice(0, 8),
    campaignsWithoutLinks: campaigns.filter((c) => !linkedCampaignIds.has(c.id)).slice(0, 12),
    failed: failedAll.length > 0 ? { count: failedAll.length, valueUSD: cents(failedAll.reduce((s, d) => s + (valueUSD(d) ?? 0), 0)) } : null,
  };
}
