import { resolveDonationSourceSignals } from "@/lib/attribution/source-signals";
/**
 * The single, comprehensive attribution resolver used by the Ads Intelligence
 * dashboard. Takes the structured signals on a donation row (utm fields, click
 * ids, fbp/fbc, GA4 enrichment, conversion event timestamps, donation status)
 * and returns:
 *
 *   - platform  the inferred ad platform (Meta/Google/TikTok/X/...)
 *   - status    one of the 8 attribution buckets (see tracking-event-contract)
 *   - confidence  0–100 score (drives the bucket)
 *   - reasons / warnings  structured rationale for the drawer
 *   - campaign/adset/ad  surfaced identifiers + names
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
  /** PAID / FAILED  failed donations under an ad still resolve to tracking_issue. */
  status: string | null | undefined;
}

export interface ResolvedAttribution {
  paidEvidence: boolean;
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

function mediumExplicitlyNonAd(medium: string | null) { return Boolean(medium && /^(?:organic|social|referral|email|sms|whatsapp)$/i.test(medium)); }

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
  const signals = resolveDonationSourceSignals(attr);
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
  const gaMedium =
    pickString(attr, "ga_medium") ?? pickString(attr, "ga4_medium");

  const platform = signals.platform;
  const gaMediumLooksPaid = gaMedium ? PAID_MEDIUMS.has(gaMedium.toLowerCase()) : false;

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
  const platformClickIdPresent = signals.clickKeys.length > 0;
  const conversionSent = !!input.conversionEventsSentAt;
  // `conversionFailedEventsSentAt` is set by the Meta CAPI DonateFailed
  // pipeline only  applying it to non-Meta platforms would incorrectly
  // bucket every Google/TikTok/X donation as `tracking_issue`.
  const conversionFailedOnly =
    platform === "meta" && !!input.conversionFailedEventsSentAt && !conversionSent;
  const isFailedUnderAd =
    isFailed && (!!utmSource || platformClickIdPresent);

  let status: AttributionStatus;
  if (signals.conflict) {
    status = "tracking_issue";
  } else if (platform === "unknown") {
    status = "unknown";
  } else if (!signals.paidEvidence) {
    status = signals.sourceKind === "direct" ? "direct" : signals.sourceKind === "organic" || signals.sourceKind === "social" || mediumExplicitlyNonAd(utmMedium ?? gaMedium) ? "organic" : "utm_only";
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
    paidEvidence: signals.paidEvidence && !signals.conflict,
    platform,
    platformLabel: PLATFORM_LABEL_AR[platform],
    status,
    confidence: platform === "unknown" ? 0 : signals.conflict ? Math.min(scored.confidence,20) : scored.confidence,
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
): "verified" | "utm-only" | "tracking-error" | "organic" | "unknown" {
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
    case "unknown":
      return "unknown";
    case "organic":
    case "direct":
      return "organic";
  }
}
