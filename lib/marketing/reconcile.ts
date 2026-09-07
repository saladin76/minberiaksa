/**
 * Reconciliation engine — joins site donations (financial source of truth)
 * with platform snapshots to produce one row per group with site metrics +
 * platform metrics + difference + a structured "likely reason" code.
 *
 * Designed to be additive: when there are no platform snapshots yet, every
 * row gets `likelyReason = "no_platform_data"` and platform fields are
 * null. The UI never shows misleading zeros.
 */
import { prisma } from "@/lib/prisma";
import { resolveAttribution } from "@/lib/tracking/attribution-resolver";
import { PAID_ATTRIBUTION_STATUSES } from "@/lib/tracking/tracking-event-contract";

export type ReconcileGroupBy =
  | "platform"
  | "campaign"
  | "ad_group"
  | "ad"
  | "placement"
  | "country"
  | "channel";

export type ReconcileLikelyReason =
  | "matched"
  | "platform_higher_likely_view_through"
  | "site_higher_likely_missing_platform_attribution"
  | "utm_only_no_click_id"
  | "missing_capi"
  | "attribution_window_difference"
  | "no_platform_data"
  | "custom_conversion_possible"
  | "ga4_inferred_only"
  | "unresolved_dynamic_macro"
  | "messaging_click_without_donation"
  | "messaging_delivery_issue"
  | "sms_failed_delivery"
  | "whatsapp_low_click_rate"
  | "email_low_open_rate"
  | "unknown";

export interface ReconcileFilters {
  /** YYYY-MM-DD inclusive (start of day UTC) */
  dateFrom: string;
  /** YYYY-MM-DD inclusive (end of day UTC) */
  dateTo: string;
  platform?: string;
  connectionId?: string;
  groupBy: ReconcileGroupBy;
}

export interface ReconcileRow {
  platform: string | null;
  channel: string | null;
  connectionId: string | null;
  accountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  adId: string | null;
  adName: string | null;
  placement: string | null;
  country: string | null;
  sitePaidDonations: number;
  siteRevenue: number;
  /** Average confidence (0–1) of paid-ad donations in this group. */
  trackingHealth: number;
  /** 0–100 score combining confidence + match with platform data. */
  confidenceScore: number;
  /** Null when no platform snapshot data is present. */
  platformReportedConversions: number | null;
  platformReportedValue: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  sent: number | null;
  delivered: number | null;
  failed: number | null;
  opened: number | null;
  clicked: number | null;
  replied: number | null;
  cpa: number | null;
  roas: number | null;
  platformRoas: number | null;
  /** Plain ratio of siteRevenue / spend (same as roas; kept distinct for future ad-budget ROI). */
  roi: number | null;
  /** platformReportedConversions - sitePaidDonations; null when platform data missing. */
  difference: number | null;
  likelyReason: ReconcileLikelyReason;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  /** Convenience: true when no snapshots existed for the period — the UI hides spend cols. */
  hasPlatformData: boolean;
  hasMessagingData: boolean;
}

function safeRatio(num: number, denom: number | null): number | null {
  if (denom == null || denom === 0 || !Number.isFinite(denom)) return null;
  if (!Number.isFinite(num)) return null;
  return Math.round((num / denom) * 10000) / 10000;
}

interface DonationAttrPick {
  status: string;
  platform: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
  confidence: number;
  countryCode: string | null;
  amountUSD: number;
  paidAt: Date | null;
  channel: string | null;
}

function donationAmount(d: {
  amountUSD: number | null;
  totalAmount: number | null;
  amount: number | null;
}): number {
  return Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
}

function pickChannel(attr: Record<string, unknown> | null): string | null {
  if (!attr) return null;
  const v = attr["channel"];
  if (typeof v === "string" && v.trim()) return v.trim();
  // Twilio tracked URLs set utm_source=twilio + utm_medium=whatsapp.
  const src = (attr["utm_source"] as string | undefined) ?? null;
  const med = (attr["utm_medium"] as string | undefined) ?? null;
  if (typeof src === "string" && src.toLowerCase() === "twilio") {
    if (typeof med === "string" && /whatsapp/i.test(med)) return "twilio_whatsapp";
    if (typeof med === "string" && /sms/i.test(med)) return "twilio_sms";
    if (typeof med === "string" && /email/i.test(med)) return "twilio_email";
    return "twilio";
  }
  return null;
}

function classifyLikelyReason(opts: {
  hasPlatformData: boolean;
  hasMessagingData: boolean;
  diff: number | null;
  sitePaid: number;
  trackingHealth: number;
  hasUnresolvedMacro: boolean;
  hasClickId: boolean;
  capiSent: boolean;
  attribStatusDistribution: Map<string, number>;
  groupBy: ReconcileGroupBy;
  delivered: number;
  sent: number;
  clicked: number;
  failed: number;
}): ReconcileLikelyReason {
  if (opts.hasUnresolvedMacro) return "unresolved_dynamic_macro";
  if (!opts.hasPlatformData && !opts.hasMessagingData) return "no_platform_data";

  if (opts.hasMessagingData && opts.groupBy === "channel") {
    if (opts.sent > 0 && opts.failed / opts.sent >= 0.2) return "sms_failed_delivery";
    if (opts.sent > 0 && opts.delivered / opts.sent <= 0.6) return "messaging_delivery_issue";
    if (opts.delivered > 0 && opts.clicked / opts.delivered <= 0.02) return "whatsapp_low_click_rate";
    if (opts.clicked > 0 && opts.sitePaid === 0) return "messaging_click_without_donation";
  }

  if (opts.diff != null) {
    if (Math.abs(opts.diff) <= Math.max(1, opts.sitePaid * 0.05)) return "matched";
    if (opts.diff > 0) return "platform_higher_likely_view_through";
    if (opts.diff < 0) return "site_higher_likely_missing_platform_attribution";
  }

  if (opts.attribStatusDistribution.get("utm_only") ?? 0 > 0) {
    if (!opts.hasClickId) return "utm_only_no_click_id";
  }
  if (!opts.capiSent && opts.sitePaid > 0) return "missing_capi";
  if (opts.attribStatusDistribution.get("ga4_inferred") ?? 0 > 0) return "ga4_inferred_only";
  if (opts.trackingHealth < 0.4) return "missing_capi";
  return "unknown";
}

export async function reconcile(filters: ReconcileFilters): Promise<ReconcileResult> {
  const from = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${filters.dateTo}T23:59:59.999Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { rows: [], hasPlatformData: false, hasMessagingData: false };
  }

  // 1. Donations in the window — apply platform filter via attribution resolver later.
  const donations = await prisma.donation.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      paidAt: true,
      donorCountryCode: true,
      attribution: true,
      amountUSD: true,
      totalAmount: true,
      amount: true,
      conversionEventsSentAt: true,
      conversionFailedEventsSentAt: true,
      status: true,
    },
  });
  const resolved: DonationAttrPick[] = donations.map((d) => {
    const r = resolveAttribution({
      attribution: d.attribution as Record<string, unknown> | null,
      conversionEventsSentAt: d.conversionEventsSentAt,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
      status: d.status,
    });
    return {
      status: r.status,
      platform: r.platform,
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      adsetId: r.adsetId,
      adId: r.adId,
      placement: r.placement,
      confidence: r.confidence,
      countryCode: d.donorCountryCode,
      amountUSD: donationAmount(d),
      paidAt: d.paidAt,
      channel: pickChannel(d.attribution as Record<string, unknown> | null),
    };
  });

  // 2. Platform snapshots in the window.
  const campaignSnapshots = await prisma.adCampaignSnapshot.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(filters.platform ? { platform: filters.platform.toUpperCase() } : {}),
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
    },
  });
  const adGroupSnapshots = await prisma.adGroupSnapshot.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(filters.platform ? { platform: filters.platform.toUpperCase() } : {}),
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
    },
  });
  const adSnapshots = await prisma.adSnapshot.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(filters.platform ? { platform: filters.platform.toUpperCase() } : {}),
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
    },
  });
  const messagingSnapshots = await prisma.marketingCampaignSnapshot.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
    },
  });

  const hasPlatformData =
    campaignSnapshots.length + adGroupSnapshots.length + adSnapshots.length > 0;
  const hasMessagingData = messagingSnapshots.length > 0;

  // 3. Build rows by groupBy. Shared aggregator.
  interface Aggregate {
    key: string;
    platform: string | null;
    channel: string | null;
    connectionId: string | null;
    accountId: string | null;
    campaignId: string | null;
    campaignName: string | null;
    adGroupId: string | null;
    adGroupName: string | null;
    adId: string | null;
    adName: string | null;
    placement: string | null;
    country: string | null;
    sitePaidDonations: number;
    siteRevenue: number;
    confidenceSum: number;
    confidenceCount: number;
    capiSentCount: number;
    hasClickIdCount: number;
    attribStatusDistribution: Map<string, number>;
    platformReportedConversions: number;
    platformReportedValue: number;
    spend: number;
    impressions: number;
    clicks: number;
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
    replied: number;
    platformDataPresent: boolean;
    messagingDataPresent: boolean;
  }

  const groups = new Map<string, Aggregate>();
  const initAggregate = (key: string, partial: Partial<Aggregate>): Aggregate => {
    let g = groups.get(key);
    if (g) return g;
    g = {
      key,
      platform: null,
      channel: null,
      connectionId: null,
      accountId: null,
      campaignId: null,
      campaignName: null,
      adGroupId: null,
      adGroupName: null,
      adId: null,
      adName: null,
      placement: null,
      country: null,
      sitePaidDonations: 0,
      siteRevenue: 0,
      confidenceSum: 0,
      confidenceCount: 0,
      capiSentCount: 0,
      hasClickIdCount: 0,
      attribStatusDistribution: new Map(),
      platformReportedConversions: 0,
      platformReportedValue: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      platformDataPresent: false,
      messagingDataPresent: false,
      ...partial,
    };
    groups.set(key, g);
    return g;
  };

  const donationKey = (d: DonationAttrPick): { key: string; init: Partial<Aggregate> } | null => {
    switch (filters.groupBy) {
      case "platform":
        return {
          key: `p|${d.platform}`,
          init: { platform: d.platform },
        };
      case "campaign":
        if (!d.campaignName && !d.campaignId) return null;
        return {
          key: `c|${d.campaignId ?? d.campaignName}`,
          init: {
            platform: d.platform,
            campaignId: d.campaignId,
            campaignName: d.campaignName ?? d.campaignId,
          },
        };
      case "ad_group":
        if (!d.adsetId) return null;
        return {
          key: `g|${d.adsetId}`,
          init: {
            platform: d.platform,
            campaignId: d.campaignId,
            campaignName: d.campaignName,
            adGroupId: d.adsetId,
          },
        };
      case "ad":
        if (!d.adId) return null;
        return {
          key: `a|${d.adId}`,
          init: {
            platform: d.platform,
            campaignId: d.campaignId,
            campaignName: d.campaignName,
            adId: d.adId,
          },
        };
      case "placement":
        if (!d.placement) return null;
        return {
          key: `pl|${d.placement}`,
          init: { platform: d.platform, placement: d.placement },
        };
      case "country":
        if (!d.countryCode) return null;
        return {
          key: `co|${d.countryCode}`,
          init: { country: d.countryCode },
        };
      case "channel":
        if (!d.channel) return null;
        return {
          key: `ch|${d.channel}`,
          init: { channel: d.channel },
        };
    }
  };

  for (const d of resolved) {
    const k = donationKey(d);
    if (!k) continue;
    const g = initAggregate(k.key, k.init);
    g.sitePaidDonations += 1;
    g.siteRevenue += d.amountUSD;
    if (PAID_ATTRIBUTION_STATUSES.has(d.status as never)) {
      g.confidenceSum += d.confidence;
      g.confidenceCount += 1;
    }
    g.attribStatusDistribution.set(
      d.status,
      (g.attribStatusDistribution.get(d.status) ?? 0) + 1
    );
    if (d.adId || d.adsetId || d.campaignId) g.hasClickIdCount += 1;
  }

  // Map platform snapshots into the same buckets.
  const addPlatformAgg = (
    key: string,
    init: Partial<Aggregate>,
    sample: {
      spend?: number;
      impressions?: number;
      clicks?: number;
      reportedConversions?: number;
      reportedConversionValue?: number;
    }
  ) => {
    const g = initAggregate(key, init);
    g.spend += sample.spend ?? 0;
    g.impressions += sample.impressions ?? 0;
    g.clicks += sample.clicks ?? 0;
    g.platformReportedConversions += sample.reportedConversions ?? 0;
    g.platformReportedValue += sample.reportedConversionValue ?? 0;
    g.platformDataPresent = true;
  };

  for (const s of campaignSnapshots) {
    if (filters.groupBy === "campaign") {
      addPlatformAgg(
        `c|${s.campaignId}`,
        {
          platform: s.platform,
          connectionId: s.connectionId,
          accountId: s.accountId,
          campaignId: s.campaignId,
          campaignName: s.campaignName ?? s.campaignId,
        },
        s
      );
    } else if (filters.groupBy === "platform") {
      addPlatformAgg(`p|${s.platform.toLowerCase()}`, { platform: s.platform.toLowerCase() }, s);
    }
  }
  for (const s of adGroupSnapshots) {
    if (filters.groupBy === "ad_group") {
      addPlatformAgg(
        `g|${s.adGroupId}`,
        {
          platform: s.platform,
          connectionId: s.connectionId,
          accountId: s.accountId,
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          adGroupId: s.adGroupId,
          adGroupName: s.adGroupName,
        },
        s
      );
    } else if (filters.groupBy === "country" && s.country) {
      addPlatformAgg(`co|${s.country.toUpperCase()}`, { country: s.country.toUpperCase() }, s);
    } else if (filters.groupBy === "placement" && s.placement) {
      addPlatformAgg(`pl|${s.placement}`, { placement: s.placement }, s);
    }
  }
  for (const s of adSnapshots) {
    if (filters.groupBy === "ad") {
      addPlatformAgg(
        `a|${s.adId}`,
        {
          platform: s.platform,
          connectionId: s.connectionId,
          accountId: s.accountId,
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          adGroupId: s.adGroupId,
          adGroupName: s.adGroupName,
          adId: s.adId,
          adName: s.adName,
        },
        s
      );
    }
  }
  // Messaging snapshots
  for (const m of messagingSnapshots) {
    if (filters.groupBy !== "channel") break;
    const g = initAggregate(`ch|${m.channel.toLowerCase()}`, {
      channel: m.channel.toLowerCase(),
      connectionId: m.connectionId,
    });
    g.sent += m.sent;
    g.delivered += m.delivered;
    g.failed += m.failed;
    g.opened += m.opened;
    g.clicked += m.clicked;
    g.replied += m.replied;
    g.spend += m.cost ?? 0;
    g.platformReportedConversions += m.donations;
    g.platformReportedValue += m.revenue;
    g.messagingDataPresent = true;
  }

  const rows: ReconcileRow[] = [];
  for (const g of groups.values()) {
    const platformDataPresent = g.platformDataPresent;
    const messagingDataPresent = g.messagingDataPresent;
    const diff =
      platformDataPresent || messagingDataPresent
        ? g.platformReportedConversions - g.sitePaidDonations
        : null;
    const trackingHealth =
      g.confidenceCount > 0 ? Math.round((g.confidenceSum / g.confidenceCount) / 100 * 10000) / 10000 : 0;
    const spend = platformDataPresent || messagingDataPresent ? Math.round(g.spend * 100) / 100 : null;
    const cpa =
      spend != null && g.sitePaidDonations > 0
        ? Math.round((g.spend / g.sitePaidDonations) * 100) / 100
        : null;
    const roas = safeRatio(g.siteRevenue, spend);
    const platformRoas = safeRatio(g.platformReportedValue, spend);
    const roi = roas;
    const hasUnresolvedMacro = false; // populated when attribution resolver flags macros at row scope

    const reason = classifyLikelyReason({
      hasPlatformData: platformDataPresent,
      hasMessagingData: messagingDataPresent,
      diff,
      sitePaid: g.sitePaidDonations,
      trackingHealth,
      hasUnresolvedMacro,
      hasClickId: g.hasClickIdCount > 0,
      capiSent: g.capiSentCount > 0,
      attribStatusDistribution: g.attribStatusDistribution,
      groupBy: filters.groupBy,
      delivered: g.delivered,
      sent: g.sent,
      clicked: g.clicked,
      failed: g.failed,
    });

    let confidenceScore = trackingHealth * 100;
    if (reason === "matched") confidenceScore = Math.max(confidenceScore, 90);
    if (!platformDataPresent && !messagingDataPresent) confidenceScore = Math.min(confidenceScore, 60);
    confidenceScore = Math.round(confidenceScore);

    rows.push({
      platform: g.platform,
      channel: g.channel,
      connectionId: g.connectionId,
      accountId: g.accountId,
      campaignId: g.campaignId,
      campaignName: g.campaignName,
      adGroupId: g.adGroupId,
      adGroupName: g.adGroupName,
      adId: g.adId,
      adName: g.adName,
      placement: g.placement,
      country: g.country,
      sitePaidDonations: g.sitePaidDonations,
      siteRevenue: Math.round(g.siteRevenue * 100) / 100,
      trackingHealth,
      confidenceScore,
      platformReportedConversions: platformDataPresent || messagingDataPresent ? g.platformReportedConversions : null,
      platformReportedValue:
        platformDataPresent || messagingDataPresent ? Math.round(g.platformReportedValue * 100) / 100 : null,
      spend,
      impressions: platformDataPresent ? g.impressions : null,
      clicks: platformDataPresent ? g.clicks : null,
      sent: messagingDataPresent ? g.sent : null,
      delivered: messagingDataPresent ? g.delivered : null,
      failed: messagingDataPresent ? g.failed : null,
      opened: messagingDataPresent ? g.opened : null,
      clicked: messagingDataPresent ? g.clicked : null,
      replied: messagingDataPresent ? g.replied : null,
      cpa,
      roas,
      platformRoas,
      roi,
      difference: diff,
      likelyReason: reason,
    });
  }

  rows.sort((a, b) => b.siteRevenue - a.siteRevenue);

  return { rows, hasPlatformData, hasMessagingData };
}

export const LIKELY_REASON_LABEL_AR: Record<ReconcileLikelyReason, string> = {
  matched: "متطابق",
  platform_higher_likely_view_through: "المنصة أعلى — على الأرجح view-through",
  site_higher_likely_missing_platform_attribution: "الموقع أعلى — المنصة قد لا تنسب التحويلات",
  utm_only_no_click_id: "UTM فقط بدون click id",
  missing_capi: "CAPI ناقص",
  attribution_window_difference: "اختلاف نافذة الإسناد",
  no_platform_data: "لا توجد بيانات منصة",
  custom_conversion_possible: "تحويل مخصص محتمل",
  ga4_inferred_only: "مأخوذ من GA4 فقط",
  unresolved_dynamic_macro: "متغير ديناميكي غير مستبدل",
  messaging_click_without_donation: "نقر بدون تبرع",
  messaging_delivery_issue: "مشكلة تسليم رسائل",
  sms_failed_delivery: "فشل تسليم SMS",
  whatsapp_low_click_rate: "نقر WhatsApp منخفض",
  email_low_open_rate: "فتح بريد منخفض",
  unknown: "غير معروف",
};
