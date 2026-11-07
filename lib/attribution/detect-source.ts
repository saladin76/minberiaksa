import { resolveDonationSourceSignals, type SourceKind } from "./source-signals";
/**
 * Detect the advertising source / tracking quality of a donation from data
 * already captured on the donation row: utm fields, click ids, fbp/fbc, and
 * the two conversion-sent timestamps written by the Meta CAPI / GA4 MP
 * pipeline. This is pure  runs identically on server and client  and is
 * the foundation for the Ads Intelligence dashboard before any external API
 * integration is wired up.
 */

export type AdPlatform =
  | "meta"
  | "google"
  | "tiktok"
  | "x"
  | "snapchat"
  | "linkedin"
  | "reddit"
  | "other-paid"
  | "organic"
  | "unknown";

/**
 * - verified: paid platform identified AND a click-id is present AND the
 *   Meta/GA conversion event fired successfully. Highest confidence.
 * - utm-only: paid platform identified but missing click-id or the
 *   conversion event was not sent (won't reconcile against the ad platform).
 * - tracking-error: paid platform identified and click-id present but the
 *   conversion event hit DonateFailed (or fbp/fbc absent on a Meta hit).
 * - organic: no paid signals at all.
 */
export type DonationSourceStatus =
  | "verified"
  | "utm-only"
  | "tracking-error"
  | "organic"
  | "unknown";

export interface DonationSourceResult {
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceDetails: Array<{ key: string; value: string }>;
  platform: AdPlatform;
  status: DonationSourceStatus;
  /** 0–100. Drives the color tier in the UI (≥80 green, 40–79 yellow, 1–39 red, 0 = organic gray). */
  confidence: number;
  campaignName: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
  /** Human-readable list of *why* this status, surfaced in the tooltip. */
  reasons: string[];
}

export interface DetectSourceInput {
  attribution: Record<string, unknown> | null | undefined;
  conversionEventsSentAt: Date | string | null | undefined;
  conversionFailedEventsSentAt: Date | string | null | undefined;
  /** PAID / FAILED  failures with click-ids still get a status but never "verified". */
  status: string | null | undefined;
}

function pickString(src: Record<string, unknown>, key: string): string | null {
  const v = src[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function detectDonationSource(input: DetectSourceInput): DonationSourceResult {
  const attr = (input.attribution ?? {}) as Record<string, unknown>;
  const signals = resolveDonationSourceSignals(attr);
  const sourceInfo = { sourceKind: signals.sourceKind, sourceLabel: signals.sourceLabel, sourceDetails: signals.sourceDetails };
  const utmSource = pickString(attr, "utm_source");
  const fbp = pickString(attr, "fbp");
  const fbc = pickString(attr, "fbc");
  const campaignName = pickString(attr, "campaign_name") ?? pickString(attr, "utm_campaign");
  const campaignId = pickString(attr, "campaign_id") ?? pickString(attr, "utm_id");
  const adsetId = pickString(attr, "adset_id") ?? pickString(attr, "ad_group_id");
  const adId = pickString(attr, "ad_id");
  const placement = pickString(attr, "placement");

  const platform = signals.platform;
  if (platform === "organic" || platform === "unknown") {
    return { ...sourceInfo, platform, status: platform, confidence: platform === "unknown" ? 0 : 30,
      campaignName, campaignId, adsetId, adId, placement,
      reasons: [platform === "unknown" ? "لا تتوفر بيانات كافية لتحديد المصدر؛ غياب التتبع لا يثبت أن الزيارة غير إعلانية" : `المصدر المسجل: ${signals.sourceLabel}`] };
  }

  const hasPlatformClickId = signals.clickKeys.length > 0;
  const conversionSent = !!input.conversionEventsSentAt;
  const conversionFailed = !!input.conversionFailedEventsSentAt;
  const metaHasCookies = platform === "meta" ? !!fbp && !!fbc : true;
  const isPaidStatus = input.status === "PAID";

  const reasons: string[] = [];
  let confidence = 0;

  // Base confidence from utm presence.
  if (utmSource) {
    confidence += 30;
    reasons.push(`utm_source = ${utmSource}`);
  }
  // Click-id is the strongest single signal  it's what the platform reconciles on.
  if (hasPlatformClickId) {
    confidence += 35;
    reasons.push("click id موجود");
  } else if (platform !== "other-paid") {
    reasons.push("click id ناقص  لن تطابق منصة الإعلان");
  }
  // Meta-specific: pixel cookies are required for browser↔CAPI dedup.
  if (platform === "meta") {
    if (metaHasCookies) {
      confidence += 10;
      reasons.push("fbp و fbc موجودان");
    } else {
      reasons.push("fbp/fbc ناقصان  match quality منخفضة");
    }
  }
  // Server-side conversion event firing.
  if (conversionSent && isPaidStatus) {
    confidence += 25;
    reasons.push("CAPI Donate أُرسل");
  } else if (isPaidStatus) {
    reasons.push("CAPI Donate لم يُرسل");
  }
  if (conversionFailed && !conversionSent) {
    reasons.push("CAPI DonateFailed فقط");
  }

  confidence = Math.max(0, Math.min(100, confidence));

  if (signals.conflict) { reasons.push("إشارات مصدر متعارضة؛ يلزم مراجعة تفاصيل الزيارة"); confidence = Math.min(confidence, 20); }
  if (!signals.paidEvidence) reasons.push("تحديد المنصة لا يثبت بمفرده أن الزيارة جاءت من إعلان مدفوع");

  // Status tier.
  let status: DonationSourceStatus;
  if (signals.conflict) {
    status = "tracking-error";
  } else if (!signals.paidEvidence) {
    status = signals.sourceKind === "social" || signals.sourceKind === "organic" ? "organic" : "utm-only";
  } else if (!isPaidStatus) {
    // FAILED donation that was at least linked to an ad  useful for waste analysis,
    // never "verified" since money never settled.
    status = "tracking-error";
    reasons.push("التبرع فشل  لا إيراد");
  } else if (
    hasPlatformClickId &&
    (conversionSent || platform === "other-paid") &&
    metaHasCookies &&
    !conversionFailed
  ) {
    status = "verified";
  } else if (hasPlatformClickId && (!conversionSent || conversionFailed || !metaHasCookies)) {
    status = "tracking-error";
  } else {
    status = "utm-only";
  }

  return {
    ...sourceInfo,
    platform,
    status,
    confidence,
    campaignName,
    campaignId,
    adsetId,
    adId,
    placement,
    reasons,
  };
}

export const PLATFORM_LABEL_AR: Record<AdPlatform, string> = {
  meta: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
  x: "X (Twitter)",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  "other-paid": "إعلان مدفوع",
  organic: "مصدر مرصود",
  unknown: "مصدر غير معروف",
};

export const STATUS_LABEL_AR: Record<DonationSourceStatus, string> = {
  verified: "موثّق",
  "utm-only": "UTM فقط",
  "tracking-error": "مشكلة تتبع",
  organic: "مصدر مرصود",
  unknown: "مصدر غير معروف",
};

export const STATUS_COLOR_CLASS: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "utm-only": "bg-amber-100 text-amber-700 border-amber-200",
  "tracking-error": "bg-red-100 text-red-700 border-red-200",
  organic: "bg-slate-100 text-slate-600 border-slate-200",
  unknown: "bg-slate-100 text-slate-600 border-slate-200",
};
