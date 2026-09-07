/**
 * The single, comprehensive attribution resolver used by the Ads Intelligence
 * dashboard. Takes the structured signals on a donation row (utm fields, click
 * ids, fbp/fbc, GA4 enrichment, conversion event timestamps, donation status)
 * and returns:
 *
 *   - platform — the inferred ad platform (Meta/Google/TikTok/X/...)
 *   - status   — one of the 8 attribution buckets (see tracking-event-contract)
 *   - confidence — 0–100 score (drives the bucket)
 *   - reasons / warnings — structured rationale for the drawer
 *   - campaign/adset/ad — surfaced identifiers + names
 *
 * Pure & deterministic; same inputs always produce same outputs.
 */
import type {
  AdPlatform,
} from "@/lib/attribution/detect-source";
import { PLATFORM_LABEL_AR } from "@/lib/attribution/detect-source";
import {
  scoreDonationDataQuality,
  type ScoringInput,
} from "./data-quality-score";
import type {
  AttributionStatus,
  ReasonEntry,
} from "./tracking-event-contract";

export interface ResolveAttributionInput {
  attribution: Record<string, unknown> | null | undefined;
  conversionEventsSentAt: Date | string | null | undefined;
  conversionFailedEventsSentAt: Date | string | null | undefined;
  /** PAID / FAILED — failed donations under an ad still resolve to tracking_issue. */
  status: string | null | undefined;
}

export interface ResolvedAttribution {
  platform: AdPlatform;
  platformLabel: string;
  status: AttributionStatus;
  confidence: number;
  reasons: ReasonEntry[];
  warnings: ReasonEntry[];
  unresolvedMacros: { field: string; value: string }[];
  // Identifiers surfaced for tables + drawer.
  campaignName: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
}

const META_SOURCES = new Set(["fb", "facebook", "ig", "instagram", "meta"]);
const GOOGLE_SOURCES = new Set([
  "google",
  "youtube",
  "yt",
  "gdn",
  "adwords",
  "google_ads",
]);
const TIKTOK_SOURCES = new Set(["tiktok", "tt"]);
const X_SOURCES = new Set(["x", "twitter"]);
const SNAPCHAT_SOURCES = new Set(["snapchat", "snap"]);
const LINKEDIN_SOURCES = new Set(["linkedin", "li"]);
const REDDIT_SOURCES = new Set(["reddit"]);

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paid_social",
  "paidsocial",
  "social_paid",
  "display",
  "banner",
  "video",
  "retargeting",
  "remarketing",
]);

function pickString(
  src: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  if (!src) return null;
  const v = src[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function classifyBySource(utmSource: string | null): AdPlatform | null {
  if (!utmSource) return null;
  const s = utmSource.toLowerCase();
  if (META_SOURCES.has(s)) return "meta";
  if (GOOGLE_SOURCES.has(s)) return "google";
  if (TIKTOK_SOURCES.has(s)) return "tiktok";
  if (X_SOURCES.has(s)) return "x";
  if (SNAPCHAT_SOURCES.has(s)) return "snapchat";
  if (LINKEDIN_SOURCES.has(s)) return "linkedin";
  if (REDDIT_SOURCES.has(s)) return "reddit";
  return null;
}

function classifyByClickId(
  attr: Record<string, unknown> | null | undefined
): AdPlatform | null {
  if (!attr) return null;
  if (pickString(attr, "fbclid") || pickString(attr, "fbc")) return "meta";
  if (
    pickString(attr, "gclid") ||
    pickString(attr, "gbraid") ||
    pickString(attr, "wbraid")
  )
    return "google";
  if (pickString(attr, "ttclid")) return "tiktok";
  if (pickString(attr, "twclid")) return "x";
  if (pickString(attr, "scclid")) return "snapchat";
  if (pickString(attr, "li_fat_id")) return "linkedin";
  if (pickString(attr, "rdt_cid")) return "reddit";
  return null;
}

function bucketFromConfidence(
  confidence: number,
  hasClickId: boolean,
  hasUtm: boolean,
  hasGaPaid: boolean,
  conversionSent: boolean,
  conversionFailedOnly: boolean,
  isPaidStatus: boolean,
  isFailedUnderAd: boolean,
  hasMacros: boolean
): AttributionStatus {
  if (hasMacros) return "tracking_issue";
  if (isFailedUnderAd) return "tracking_issue";
  if (conversionFailedOnly && isPaidStatus) return "tracking_issue";
  if (confidence >= 90) return "verified";
  if (confidence >= 75) return hasClickId && conversionSent ? "verified" : "strong";
  if (confidence >= 60) return "likely_paid";
  if (confidence >= 40) return hasGaPaid && !hasUtm ? "ga4_inferred" : "utm_only";
  if (hasUtm || hasGaPaid) return "utm_only";
  return "organic";
}

export function resolveAttribution(input: ResolveAttributionInput): ResolvedAttribution {
  const attr = input.attribution ?? {};
  const utmSource = pickString(attr, "utm_source");
  const utmMedium = pickString(attr, "utm_medium");
  const utmCampaign = pickString(attr, "utm_campaign");
  const campaignName = pickString(attr, "campaign_name") ?? utmCampaign;
  const campaignId = pickString(attr, "campaign_id");
  const adsetId =
    pickString(attr, "adset_id") ??
    pickString(attr, "ad_group_id") ??
    pickString(attr, "adgroup_id");
  const adId = pickString(attr, "ad_id");
  const placement = pickString(attr, "placement");
  const referrer = pickString(attr, "referrer") ?? pickString(attr, "ga_referrer");
  const gaSource =
    pickString(attr, "ga_source") ?? pickString(attr, "ga4_source");
  const gaMedium =
    pickString(attr, "ga_medium") ?? pickString(attr, "ga4_medium");

  // Step 1: figure out platform from utm_source / click id / utm_medium / ga4.
  let platform: AdPlatform | null = classifyBySource(utmSource);
  if (!platform) platform = classifyByClickId(attr);
  if (!platform && gaSource) platform = classifyBySource(gaSource);
  const mediumLooksPaid = utmMedium
    ? PAID_MEDIUMS.has(utmMedium.toLowerCase())
    : false;
  const gaMediumLooksPaid = gaMedium
    ? PAID_MEDIUMS.has(gaMedium.toLowerCase())
    : false;
  if (!platform && (mediumLooksPaid || gaMediumLooksPaid)) platform = "other-paid";

  if (!platform) platform = "organic";

  // Step 2: score data quality, using the platform we just resolved.
  const scoreInput: ScoringInput = {
    attribution: input.attribution,
    conversionEventsSentAt: input.conversionEventsSentAt,
    conversionFailedEventsSentAt: input.conversionFailedEventsSentAt,
    status: input.status,
    platform,
  };
  const scored = scoreDonationDataQuality(scoreInput);

  // Step 3: bucket into one of the 8 attribution statuses.
  const isPaid = input.status === "PAID";
  const isFailed = input.status === "FAILED";
  const platformClickIdPresent = (() => {
    if (platform === "meta")
      return !!(pickString(attr, "fbclid") || pickString(attr, "fbc"));
    if (platform === "google")
      return !!(
        pickString(attr, "gclid") ||
        pickString(attr, "gbraid") ||
        pickString(attr, "wbraid")
      );
    if (platform === "tiktok") return !!pickString(attr, "ttclid");
    if (platform === "x") return !!pickString(attr, "twclid");
    if (platform === "snapchat") return !!pickString(attr, "scclid");
    if (platform === "linkedin") return !!pickString(attr, "li_fat_id");
    if (platform === "reddit") return !!pickString(attr, "rdt_cid");
    return false;
  })();
  const conversionSent = !!input.conversionEventsSentAt;
  // `conversionFailedEventsSentAt` is set by the Meta CAPI DonateFailed
  // pipeline only — applying it to non-Meta platforms would incorrectly
  // bucket every Google/TikTok/X donation as `tracking_issue`.
  const conversionFailedOnly =
    platform === "meta" && !!input.conversionFailedEventsSentAt && !conversionSent;
  const isFailedUnderAd =
    isFailed && (!!utmSource || platformClickIdPresent || !!gaSource);

  let status: AttributionStatus;
  if (platform === "organic") {
    // No paid signals at all.
    if (!utmSource && !utmMedium && !gaSource && !referrer) {
      status = "direct";
    } else if (
      (utmMedium && /(organic|social|referral|email)/i.test(utmMedium)) ||
      (gaMedium && /(organic|social|referral|email)/i.test(gaMedium))
    ) {
      status = "organic";
    } else if (referrer) {
      status = "organic";
    } else {
      status = "direct";
    }
  } else {
    status = bucketFromConfidence(
      scored.confidence,
      platformClickIdPresent,
      !!utmSource,
      gaMediumLooksPaid && !utmSource,
      conversionSent,
      conversionFailedOnly,
      isPaid,
      isFailedUnderAd,
      scored.unresolvedMacros.length > 0
    );
  }

  return {
    platform,
    platformLabel: PLATFORM_LABEL_AR[platform],
    status,
    confidence: scored.confidence,
    reasons: scored.reasons,
    warnings: scored.warnings,
    unresolvedMacros: scored.unresolvedMacros,
    campaignName,
    campaignId,
    adsetId,
    adId,
    placement,
  };
}

/**
 * Map the new 8-status taxonomy onto the legacy 4-bucket taxonomy used by the
 * donation badge / donor journey UI. Lossy but stable.
 */
export function toLegacyStatus(
  status: AttributionStatus
): "verified" | "utm-only" | "tracking-error" | "organic" {
  switch (status) {
    case "verified":
    case "strong":
      return "verified";
    case "likely_paid":
    case "ga4_inferred":
    case "utm_only":
      return "utm-only";
    case "tracking_issue":
      return "tracking-error";
    case "organic":
    case "direct":
      return "organic";
  }
}
