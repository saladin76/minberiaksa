/**
 * Detect the advertising source / tracking quality of a donation from data
 * already captured on the donation row: utm fields, click ids, fbp/fbc, and
 * the two conversion-sent timestamps written by the Meta CAPI / GA4 MP
 * pipeline. This is pure — runs identically on server and client — and is
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
  | "organic";

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
  | "organic";

export interface DonationSourceResult {
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
  /** PAID / FAILED — failures with click-ids still get a status but never "verified". */
  status: string | null | undefined;
}

const META_SOURCES = new Set(["fb", "facebook", "ig", "instagram", "meta"]);
const GOOGLE_SOURCES = new Set(["google", "youtube", "yt", "gdn", "adwords"]);
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

function pickString(src: Record<string, unknown>, key: string): string | null {
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

export function detectDonationSource(input: DetectSourceInput): DonationSourceResult {
  const attr = (input.attribution ?? {}) as Record<string, unknown>;
  const utmSource = pickString(attr, "utm_source");
  const utmMedium = pickString(attr, "utm_medium");
  const fbclid = pickString(attr, "fbclid");
  const gclid = pickString(attr, "gclid");
  const ttclid = pickString(attr, "ttclid");
  const snapClickId = pickString(attr, "snap_click_id") ?? pickString(attr, "scid");
  const fbp = pickString(attr, "fbp");
  const fbc = pickString(attr, "fbc");
  const campaignName = pickString(attr, "utm_campaign");
  const campaignId = pickString(attr, "campaign_id");
  const adsetId = pickString(attr, "adset_id");
  const adId = pickString(attr, "ad_id");
  const placement = pickString(attr, "placement");

  // Click-id alone is enough to identify the platform even if utm fields were dropped.
  let platform: AdPlatform | null = classifyBySource(utmSource);
  if (!platform) {
    if (fbclid) platform = "meta";
    else if (gclid) platform = "google";
    else if (ttclid) platform = "tiktok";
    else if (snapClickId) platform = "snapchat";
  }

  // utm_medium of cpc/ppc/paid_social on an unknown source still means paid traffic.
  const mediumLooksPaid = utmMedium ? PAID_MEDIUMS.has(utmMedium.toLowerCase()) : false;
  if (!platform && mediumLooksPaid) platform = "other-paid";

  if (!platform) {
    return {
      platform: "organic",
      status: "organic",
      confidence: 0,
      campaignName,
      campaignId,
      adsetId,
      adId,
      placement,
      reasons: ["لا يوجد utm أو click id"],
    };
  }

  const platformClickId =
    platform === "meta"
      ? fbclid
      : platform === "google"
      ? gclid
      : platform === "tiktok"
      ? ttclid
      : platform === "snapchat"
      ? snapClickId
      : null;
  const hasPlatformClickId = !!platformClickId;
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
  // Click-id is the strongest single signal — it's what the platform reconciles on.
  if (hasPlatformClickId) {
    confidence += 35;
    reasons.push("click id موجود");
  } else if (platform !== "other-paid") {
    reasons.push("click id ناقص — لن تطابق منصة الإعلان");
  }
  // Meta-specific: pixel cookies are required for browser↔CAPI dedup.
  if (platform === "meta") {
    if (metaHasCookies) {
      confidence += 10;
      reasons.push("fbp و fbc موجودان");
    } else {
      reasons.push("fbp/fbc ناقصان — match quality منخفضة");
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

  // Status tier.
  let status: DonationSourceStatus;
  if (!isPaidStatus) {
    // FAILED donation that was at least linked to an ad — useful for waste analysis,
    // never "verified" since money never settled.
    status = "tracking-error";
    reasons.push("التبرع فشل — لا إيراد");
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
  organic: "غير إعلاني",
};

export const STATUS_LABEL_AR: Record<DonationSourceStatus, string> = {
  verified: "موثّق",
  "utm-only": "UTM فقط",
  "tracking-error": "مشكلة تتبع",
  organic: "غير إعلاني",
};

export const STATUS_COLOR_CLASS: Record<DonationSourceStatus, string> = {
  verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "utm-only": "bg-amber-100 text-amber-700 border-amber-200",
  "tracking-error": "bg-red-100 text-red-700 border-red-200",
  organic: "bg-slate-100 text-slate-600 border-slate-200",
};
