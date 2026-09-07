/**
 * Pure aggregation helpers shared by all `/api/admin/ads/*` routes.
 * Each function takes already-fetched donation rows (with the minimum fields
 * needed) and produces dashboard-ready aggregates. No DB access here — keeps
 * the routes thin and unit-testable, and lets the same logic run client-side
 * in the future if we add a "what-if" filter UI.
 *
 * Backed by `lib/tracking/attribution-resolver` which produces the 8-status
 * taxonomy + confidence score used across every endpoint.
 */

import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "./detect-source";
import {
  resolveAttribution,
  type ResolvedAttribution,
} from "@/lib/tracking/attribution-resolver";
import {
  ATTRIBUTION_STATUS_LABEL_AR,
  PAID_ATTRIBUTION_STATUSES,
  NON_AD_ATTRIBUTION_STATUSES,
  type AttributionStatus,
  type ReasonEntry,
} from "@/lib/tracking/tracking-event-contract";

export type BreakdownDimension =
  | "platform"
  | "campaign"
  | "adset"
  | "ad"
  | "placement"
  | "country"
  | "device";

export interface AggregateDonationInput {
  id: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  amountUSD: number | null;
  totalAmount: number | null;
  amount: number | null;
  currency: string;
  attribution: Record<string, unknown> | null;
  conversionEventsSentAt: Date | null;
  conversionFailedEventsSentAt: Date | null;
  donorId: string;
  donorCountryCode: string | null;
  /** First donation ever (across all time) for this donor — used to flag new-donor revenue. */
  isFirstEverDonation: boolean;
}

interface SubAggregate {
  key: string;
  label: string;
  revenueUSD: number;
  paidCount: number;
}

export interface BreakdownRow {
  key: string;
  /** Human label — name when available, otherwise id (utm_campaign / utm_content / placement / etc.). */
  label: string;
  /** Display name (e.g. utm_campaign value). Null when only a platform id is known. */
  name: string | null;
  /** Platform id (campaign_id / adset_id / ad_id). Null when only a name is known. */
  id: string | null;
  /** Platform tag for color-coding (only populated when grouping by platform / campaign / ad / etc). */
  platform: AdPlatform | null;
  revenueUSD: number;
  paidCount: number;
  failedCount: number;
  totalAttempts: number;
  avgDonationUSD: number;
  /** paidCount / totalAttempts. 0 when no attempts. */
  paymentSuccessRate: number;
  /** Average confidence (0–1) across paid-ad donations in this group. */
  trackingHealthPct: number;
  /** Same value scaled 0–100 — handy for quick `>= 75` comparisons. */
  avgConfidence: number;
  /** Distinct donors who paid in this group. */
  uniqueDonors: number;
  /** Donors whose VERY FIRST donation ever happened in this group (LTV anchor). */
  newDonors: number;
  /** Donors who had donated previously (before their in-window donation here). */
  returningDonors: number;
  /** Share of total revenue across all rows in the breakdown (0–1). */
  revenueShare: number;
  /** Share of total paid count across all rows in the breakdown (0–1). */
  donationShare: number;
  /** Revenue from monthly subscriptions specifically (subscriptionId != null). */
  monthlyRevenueUSD: number;
  // ── dimension-specific extras (populated by aggregateBreakdownExtended)
  bestPlatform?: {
    key: AdPlatform;
    label: string;
    revenueUSD: number;
    share: number;
  } | null;
  bestPlacement?: {
    key: string;
    label: string;
    revenueUSD: number;
    share: number;
  } | null;
  bestCampaign?: { key: string; label: string; revenueUSD: number } | null;
  bestAd?: { key: string; label: string; revenueUSD: number } | null;
  /** Share of this group's revenue that came from a paid ad (0–1). */
  adRevenueShare?: number;
}

function donationAmount(d: AggregateDonationInput): number {
  return Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
}

function pickAttr(
  attr: Record<string, unknown> | null,
  key: string
): string | null {
  if (!attr) return null;
  const v = attr[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

interface DimValue {
  key: string;
  label: string;
  name: string | null;
  id: string | null;
  platform: AdPlatform | null;
}

function dimensionValue(
  d: AggregateDonationInput,
  source: ResolvedAttribution,
  dimension: BreakdownDimension
): DimValue | null {
  const attr = d.attribution ?? {};
  switch (dimension) {
    case "platform":
      return {
        key: source.platform,
        label: PLATFORM_LABEL_AR[source.platform],
        name: PLATFORM_LABEL_AR[source.platform],
        id: source.platform,
        platform: source.platform,
      };
    case "campaign": {
      const name = source.campaignName ?? pickAttr(attr, "utm_campaign");
      const id = source.campaignId;
      if (!name && !id) return null;
      const key = id ?? name ?? "__unset";
      return {
        key,
        label: name ?? id ?? "—",
        name,
        id,
        platform: source.platform,
      };
    }
    case "adset": {
      const id =
        source.adsetId ??
        pickAttr(attr, "adset_id") ??
        pickAttr(attr, "ad_group_id");
      const name =
        pickAttr(attr, "adset_name") ?? pickAttr(attr, "ad_group_name");
      if (!id && !name) return null;
      const key = id ?? name ?? "__unset";
      return { key, label: name ?? id ?? "—", name, id, platform: source.platform };
    }
    case "ad": {
      const id = source.adId ?? pickAttr(attr, "ad_id");
      const name =
        pickAttr(attr, "ad_name") ?? pickAttr(attr, "utm_content");
      if (!id && !name) return null;
      const key = id ?? name ?? "__unset";
      return { key, label: name ?? id ?? "—", name, id, platform: source.platform };
    }
    case "placement": {
      const v = source.placement ?? pickAttr(attr, "placement");
      if (!v) return null;
      return { key: v, label: v, name: v, id: null, platform: source.platform };
    }
    case "country": {
      const v =
        d.donorCountryCode ??
        pickAttr(attr, "country_code") ??
        pickAttr(attr, "country");
      if (!v) return { key: "__unset", label: "غير محدد", name: null, id: null, platform: null };
      const up = v.toUpperCase();
      return { key: up, label: up, name: up, id: null, platform: null };
    }
    case "device": {
      const v = pickAttr(attr, "device") ?? pickAttr(attr, "platform");
      if (!v) return { key: "__unset", label: "غير محدد", name: null, id: null, platform: null };
      return { key: v.toLowerCase(), label: v, name: v, id: null, platform: null };
    }
  }
}

interface MutableRow {
  key: string;
  label: string;
  name: string | null;
  id: string | null;
  platform: AdPlatform | null;
  revenueUSD: number;
  paidCount: number;
  failedCount: number;
  totalAttempts: number;
  monthlyRevenueUSD: number;
  donorSet: Set<string>;
  newDonorSet: Set<string>;
  returningDonorSet: Set<string>;
  /** Sum of confidence for ad-attributed paid donations only. */
  paidConfidenceSum: number;
  paidConfidenceCount: number;
  paidAdRevenueUSD: number;
  // sub-aggregates for country/placement extras
  byPlatform: Map<AdPlatform, SubAggregate>;
  byPlacement: Map<string, SubAggregate>;
  byCampaign: Map<string, SubAggregate>;
  byAd: Map<string, SubAggregate>;
}

function getOrInit<K, V>(map: Map<K, V>, k: K, factory: () => V): V {
  let v = map.get(k);
  if (!v) {
    v = factory();
    map.set(k, v);
  }
  return v;
}

export function aggregateBreakdown(
  donations: AggregateDonationInput[],
  dimension: BreakdownDimension
): BreakdownRow[] {
  const rows = new Map<string, MutableRow>();
  for (const d of donations) {
    const source = resolveAttribution({
      attribution: d.attribution,
      conversionEventsSentAt: d.conversionEventsSentAt,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
      status: d.status,
    });
    const dim = dimensionValue(d, source, dimension);
    if (!dim) continue;
    const row = getOrInit(rows, dim.key, () => ({
      key: dim.key,
      label: dim.label,
      name: dim.name,
      id: dim.id,
      platform: dim.platform,
      revenueUSD: 0,
      paidCount: 0,
      failedCount: 0,
      totalAttempts: 0,
      monthlyRevenueUSD: 0,
      donorSet: new Set<string>(),
      newDonorSet: new Set<string>(),
      returningDonorSet: new Set<string>(),
      paidConfidenceSum: 0,
      paidConfidenceCount: 0,
      paidAdRevenueUSD: 0,
      byPlatform: new Map<AdPlatform, SubAggregate>(),
      byPlacement: new Map<string, SubAggregate>(),
      byCampaign: new Map<string, SubAggregate>(),
      byAd: new Map<string, SubAggregate>(),
    }));
    // Keep richer label/name/id when later row has more info.
    if (!row.name && dim.name) row.name = dim.name;
    if (!row.id && dim.id) row.id = dim.id;
    if (!row.platform && dim.platform) row.platform = dim.platform;
    if (row.label === row.id && dim.name) row.label = dim.name;

    const amount = donationAmount(d);
    row.totalAttempts += 1;
    if (d.status === "PAID" && d.paidAt) {
      row.revenueUSD += amount;
      row.paidCount += 1;
      row.donorSet.add(d.donorId);
      if (d.isFirstEverDonation) row.newDonorSet.add(d.donorId);
      else row.returningDonorSet.add(d.donorId);
      if (PAID_ATTRIBUTION_STATUSES.has(source.status)) {
        row.paidConfidenceSum += source.confidence;
        row.paidConfidenceCount += 1;
        row.paidAdRevenueUSD += amount;
      }
      // sub-aggregates for country / placement enrichment
      const subPlat = getOrInit(row.byPlatform, source.platform, () => ({
        key: source.platform,
        label: PLATFORM_LABEL_AR[source.platform],
        revenueUSD: 0,
        paidCount: 0,
      }));
      subPlat.revenueUSD += amount;
      subPlat.paidCount += 1;
      const placementKey =
        source.placement ?? pickAttr(d.attribution, "placement");
      if (placementKey) {
        const sub = getOrInit(row.byPlacement, placementKey, () => ({
          key: placementKey,
          label: placementKey,
          revenueUSD: 0,
          paidCount: 0,
        }));
        sub.revenueUSD += amount;
        sub.paidCount += 1;
      }
      const campaignKey =
        source.campaignName ??
        source.campaignId ??
        pickAttr(d.attribution, "utm_campaign");
      if (campaignKey) {
        const sub = getOrInit(row.byCampaign, campaignKey, () => ({
          key: campaignKey,
          label: campaignKey,
          revenueUSD: 0,
          paidCount: 0,
        }));
        sub.revenueUSD += amount;
        sub.paidCount += 1;
      }
      const adKey =
        source.adId ??
        pickAttr(d.attribution, "ad_id") ??
        pickAttr(d.attribution, "utm_content");
      if (adKey) {
        const adLabel =
          pickAttr(d.attribution, "ad_name") ??
          pickAttr(d.attribution, "utm_content") ??
          adKey;
        const sub = getOrInit(row.byAd, adKey, () => ({
          key: adKey,
          label: adLabel,
          revenueUSD: 0,
          paidCount: 0,
        }));
        sub.revenueUSD += amount;
        sub.paidCount += 1;
      }
    } else if (d.status === "FAILED") {
      row.failedCount += 1;
    }
  }

  // Totals for share calculations
  let totalRevenue = 0;
  let totalPaid = 0;
  for (const r of rows.values()) {
    totalRevenue += r.revenueUSD;
    totalPaid += r.paidCount;
  }

  const out: BreakdownRow[] = [];
  for (const r of rows.values()) {
    const uniqueDonors = r.donorSet.size;
    const newDonors = r.newDonorSet.size;
    const returningDonors = r.returningDonorSet.size;
    const avg = r.paidCount > 0 ? r.revenueUSD / r.paidCount : 0;
    const successRate =
      r.totalAttempts > 0 ? r.paidCount / r.totalAttempts : 0;
    const avgConfidence =
      r.paidConfidenceCount > 0
        ? r.paidConfidenceSum / r.paidConfidenceCount
        : 0;
    const trackingHealth = avgConfidence / 100;
    const revenueShare = totalRevenue > 0 ? r.revenueUSD / totalRevenue : 0;
    const donationShare = totalPaid > 0 ? r.paidCount / totalPaid : 0;
    const adRevenueShare =
      r.revenueUSD > 0 ? r.paidAdRevenueUSD / r.revenueUSD : 0;

    let bestPlatform: BreakdownRow["bestPlatform"] = null;
    if (dimension === "country" || dimension === "placement") {
      let bp: SubAggregate | null = null;
      for (const s of r.byPlatform.values()) {
        if (s.key === "organic") continue;
        if (!bp || s.revenueUSD > bp.revenueUSD) bp = s;
      }
      if (bp && r.revenueUSD > 0) {
        bestPlatform = {
          key: bp.key as AdPlatform,
          label: bp.label,
          revenueUSD: Math.round(bp.revenueUSD * 100) / 100,
          share: bp.revenueUSD / r.revenueUSD,
        };
      }
    }
    let bestPlacement: BreakdownRow["bestPlacement"] = null;
    if (dimension === "country") {
      let bp: SubAggregate | null = null;
      for (const s of r.byPlacement.values()) {
        if (!bp || s.revenueUSD > bp.revenueUSD) bp = s;
      }
      if (bp && r.revenueUSD > 0) {
        bestPlacement = {
          key: bp.key,
          label: bp.label,
          revenueUSD: Math.round(bp.revenueUSD * 100) / 100,
          share: bp.revenueUSD / r.revenueUSD,
        };
      }
    }
    let bestCampaign: BreakdownRow["bestCampaign"] = null;
    if (dimension === "country" || dimension === "placement") {
      let bc: SubAggregate | null = null;
      for (const s of r.byCampaign.values()) {
        if (!bc || s.revenueUSD > bc.revenueUSD) bc = s;
      }
      if (bc) {
        bestCampaign = {
          key: bc.key,
          label: bc.label,
          revenueUSD: Math.round(bc.revenueUSD * 100) / 100,
        };
      }
    }
    let bestAd: BreakdownRow["bestAd"] = null;
    if (dimension === "country" || dimension === "placement") {
      let ba: SubAggregate | null = null;
      for (const s of r.byAd.values()) {
        if (!ba || s.revenueUSD > ba.revenueUSD) ba = s;
      }
      if (ba) {
        bestAd = {
          key: ba.key,
          label: ba.label,
          revenueUSD: Math.round(ba.revenueUSD * 100) / 100,
        };
      }
    }

    out.push({
      key: r.key,
      label: r.label,
      name: r.name,
      id: r.id,
      platform: r.platform,
      revenueUSD: Math.round(r.revenueUSD * 100) / 100,
      paidCount: r.paidCount,
      failedCount: r.failedCount,
      totalAttempts: r.totalAttempts,
      monthlyRevenueUSD: 0,
      avgDonationUSD: Math.round(avg * 100) / 100,
      paymentSuccessRate: Math.round(successRate * 10000) / 10000,
      trackingHealthPct: Math.round(trackingHealth * 10000) / 10000,
      avgConfidence: Math.round(avgConfidence * 10) / 10,
      uniqueDonors,
      newDonors,
      returningDonors,
      revenueShare: Math.round(revenueShare * 10000) / 10000,
      donationShare: Math.round(donationShare * 10000) / 10000,
      bestPlatform,
      bestPlacement,
      bestCampaign,
      bestAd,
      adRevenueShare: Math.round(adRevenueShare * 10000) / 10000,
    });
  }
  // Default sort by revenue desc.
  out.sort((a, b) => b.revenueUSD - a.revenueUSD);
  return out;
}

export interface AttributionRevenueSplit {
  verified: number;
  strong: number;
  likely_paid: number;
  ga4_inferred: number;
  utm_only: number;
  organic: number;
  direct: number;
  tracking_issue: number;
}

export interface OverviewResult {
  adRevenueUSD: number;
  organicRevenueUSD: number;
  totalRevenueUSD: number;
  adShare: number;
  paidAdCount: number;
  paidOrganicCount: number;
  failedCount: number;
  /** Average confidence (0-1) across PAID donations that resolved to a paid ad bucket. */
  trackingHealthPct: number;
  trackingErrorCount: number;
  newDonorsFromAds: number;
  newDonorsOrganic: number;
  topPlatform: BreakdownRow | null;
  topCampaign: BreakdownRow | null;
  topAd: BreakdownRow | null;
  topCountry: BreakdownRow | null;
  /** Distribution of statuses across all PAID donations in window (8 buckets). */
  statusDistribution: Record<AttributionStatus, number>;
  /** Revenue per attribution status (8 buckets). */
  revenueByStatus: AttributionRevenueSplit;
}

export function computeOverview(donations: AggregateDonationInput[]): OverviewResult {
  let adRevenueUSD = 0;
  let organicRevenueUSD = 0;
  let paidAdCount = 0;
  let paidOrganicCount = 0;
  let failedCount = 0;
  let paidAdConfidenceSum = 0;
  let paidAdConfidenceCount = 0;
  let trackingErrorCount = 0;
  const newDonorsAd = new Set<string>();
  const newDonorsOrg = new Set<string>();
  const statusDist: Record<AttributionStatus, number> = {
    verified: 0,
    strong: 0,
    likely_paid: 0,
    ga4_inferred: 0,
    utm_only: 0,
    organic: 0,
    direct: 0,
    tracking_issue: 0,
  };
  const revenueByStatus: AttributionRevenueSplit = {
    verified: 0,
    strong: 0,
    likely_paid: 0,
    ga4_inferred: 0,
    utm_only: 0,
    organic: 0,
    direct: 0,
    tracking_issue: 0,
  };

  for (const d of donations) {
    const source = resolveAttribution({
      attribution: d.attribution,
      conversionEventsSentAt: d.conversionEventsSentAt,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
      status: d.status,
    });
    const amount = donationAmount(d);
    if (d.status === "FAILED") {
      failedCount += 1;
      if (source.status === "tracking_issue") trackingErrorCount += 1;
      continue;
    }
    if (d.status !== "PAID" || !d.paidAt) continue;
    statusDist[source.status] += 1;
    revenueByStatus[source.status] += amount;
    if (source.status === "tracking_issue") trackingErrorCount += 1;
    if (NON_AD_ATTRIBUTION_STATUSES.has(source.status)) {
      organicRevenueUSD += amount;
      paidOrganicCount += 1;
      if (d.isFirstEverDonation) newDonorsOrg.add(d.donorId);
    } else {
      adRevenueUSD += amount;
      paidAdCount += 1;
      if (d.isFirstEverDonation) newDonorsAd.add(d.donorId);
      if (PAID_ATTRIBUTION_STATUSES.has(source.status)) {
        paidAdConfidenceSum += source.confidence;
        paidAdConfidenceCount += 1;
      }
    }
  }

  const totalRevenue = adRevenueUSD + organicRevenueUSD;
  const adShare = totalRevenue > 0 ? adRevenueUSD / totalRevenue : 0;
  const trackingHealth =
    paidAdConfidenceCount > 0
      ? paidAdConfidenceSum / paidAdConfidenceCount / 100
      : 0;

  const platforms = aggregateBreakdown(donations, "platform").filter(
    (r) => r.platform !== "organic"
  );
  const campaigns = aggregateBreakdown(donations, "campaign");
  const ads = aggregateBreakdown(donations, "ad");
  const countries = aggregateBreakdown(donations, "country").filter(
    (r) => r.key !== "__unset"
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    adRevenueUSD: round2(adRevenueUSD),
    organicRevenueUSD: round2(organicRevenueUSD),
    totalRevenueUSD: round2(totalRevenue),
    adShare: Math.round(adShare * 10000) / 10000,
    paidAdCount,
    paidOrganicCount,
    failedCount,
    trackingHealthPct: Math.round(trackingHealth * 10000) / 10000,
    trackingErrorCount,
    newDonorsFromAds: newDonorsAd.size,
    newDonorsOrganic: newDonorsOrg.size,
    topPlatform: platforms[0] ?? null,
    topCampaign: campaigns[0] ?? null,
    topAd: ads[0] ?? null,
    topCountry: countries[0] ?? null,
    statusDistribution: statusDist,
    revenueByStatus: {
      verified: round2(revenueByStatus.verified),
      strong: round2(revenueByStatus.strong),
      likely_paid: round2(revenueByStatus.likely_paid),
      ga4_inferred: round2(revenueByStatus.ga4_inferred),
      utm_only: round2(revenueByStatus.utm_only),
      organic: round2(revenueByStatus.organic),
      direct: round2(revenueByStatus.direct),
      tracking_issue: round2(revenueByStatus.tracking_issue),
    },
  };
}

export interface DiagnosticRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  amountUSD: number;
  platform: AdPlatform;
  platformLabel: string;
  sourceStatus: AttributionStatus;
  sourceStatusLabel: string;
  confidence: number;
  reasons: ReasonEntry[];
  /** Subset of reasons with severity warning or error. */
  warnings: ReasonEntry[];
  /** Count of warnings (for table column). */
  warningCount: number;
  donorId: string;
  campaignName: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
  /** True if the row has an issue worth surfacing on the Diagnostics tab. */
  hasIssue: boolean;
}

export interface DiagnosticIssueCounts {
  total: number;
  capiMissing: number;
  capiFailedOnly: number;
  browserMissing: number;
  clickIdMissing: number;
  unresolvedMacros: number;
  ga4Missing: number;
  utmOnly: number;
  organicOrDirect: number;
  platformMismatch: number;
  trackingIssue: number;
}

export function buildDiagnosticRows(
  donations: AggregateDonationInput[]
): { rows: DiagnosticRow[]; counts: Record<AttributionStatus, number>; issueCounts: DiagnosticIssueCounts } {
  const rows: DiagnosticRow[] = [];
  const counts: Record<AttributionStatus, number> = {
    verified: 0,
    strong: 0,
    likely_paid: 0,
    ga4_inferred: 0,
    utm_only: 0,
    organic: 0,
    direct: 0,
    tracking_issue: 0,
  };
  const issueCounts: DiagnosticIssueCounts = {
    total: 0,
    capiMissing: 0,
    capiFailedOnly: 0,
    browserMissing: 0,
    clickIdMissing: 0,
    unresolvedMacros: 0,
    ga4Missing: 0,
    utmOnly: 0,
    organicOrDirect: 0,
    platformMismatch: 0,
    trackingIssue: 0,
  };

  for (const d of donations) {
    const source = resolveAttribution({
      attribution: d.attribution,
      conversionEventsSentAt: d.conversionEventsSentAt,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
      status: d.status,
    });
    counts[source.status] += 1;

    const isNonAd = NON_AD_ATTRIBUTION_STATUSES.has(source.status);
    const isFullyVerified = source.status === "verified" && source.confidence >= 90;
    const hasIssue = !isNonAd && !isFullyVerified;
    if (hasIssue) issueCounts.total += 1;

    const reasonCodes = new Set(source.reasons.map((r) => r.code));
    if (reasonCodes.has("capi_donate_missing")) issueCounts.capiMissing += 1;
    if (reasonCodes.has("capi_donate_failed_only")) issueCounts.capiFailedOnly += 1;
    if (reasonCodes.has("browser_donate_missing")) issueCounts.browserMissing += 1;
    if (
      reasonCodes.has("fbclid_or_fbc_missing") ||
      reasonCodes.has("gclid_or_gbraid_missing") ||
      reasonCodes.has("ttclid_missing") ||
      reasonCodes.has("twclid_missing") ||
      reasonCodes.has("utm_without_click_id")
    ) {
      issueCounts.clickIdMissing += 1;
    }
    if (reasonCodes.has("dynamic_macro_unresolved")) issueCounts.unresolvedMacros += 1;
    if (
      reasonCodes.has("ga4_client_or_session_missing") ||
      reasonCodes.has("ga4_purchase_missing")
    )
      issueCounts.ga4Missing += 1;
    if (source.status === "utm_only") issueCounts.utmOnly += 1;
    if (isNonAd) issueCounts.organicOrDirect += 1;
    if (reasonCodes.has("platform_mismatch")) issueCounts.platformMismatch += 1;
    if (source.status === "tracking_issue") issueCounts.trackingIssue += 1;

    rows.push({
      id: d.id,
      createdAt: d.createdAt.toISOString(),
      paidAt: d.paidAt ? d.paidAt.toISOString() : null,
      status: d.status,
      amountUSD: donationAmount(d),
      platform: source.platform,
      platformLabel: PLATFORM_LABEL_AR[source.platform],
      sourceStatus: source.status,
      sourceStatusLabel: ATTRIBUTION_STATUS_LABEL_AR[source.status],
      confidence: source.confidence,
      reasons: source.reasons,
      warnings: source.warnings,
      warningCount: source.warnings.length,
      donorId: d.donorId,
      campaignName: source.campaignName,
      campaignId: source.campaignId,
      adsetId: source.adsetId,
      adId: source.adId,
      placement: source.placement,
      hasIssue,
    });
  }
  return { rows, counts, issueCounts };
}
