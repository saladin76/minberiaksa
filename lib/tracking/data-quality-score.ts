/**
 * Pure scoring helper: given the structured signals we can read off a
 * donation row, return a 0–100 confidence score and the list of reason codes
 * that contributed to it. The scoring tiers (90+ verified, 75+ strong, etc.)
 * are defined in `tracking-event-contract.ts`.
 *
 * No DB access, no fetch — runs identically server-side in the routes and
 * (later) client-side for what-if filters.
 */
import type { AdPlatform } from "@/lib/attribution/detect-source";
import type { ReasonCode, ReasonEntry } from "./tracking-event-contract";
import {
  PLATFORM_EXPECTATIONS,
  detectUnresolvedMacros,
} from "./platform-diagnostics";

export interface ScoringInput {
  attribution: Record<string, unknown> | null | undefined;
  conversionEventsSentAt: Date | string | null | undefined;
  conversionFailedEventsSentAt: Date | string | null | undefined;
  status: string | null | undefined;
  /** Already-detected platform — pass null to score as organic/direct only. */
  platform: AdPlatform | null;
}

export interface ScoringResult {
  confidence: number; // 0-100
  reasons: ReasonEntry[];
  /** Subset of `reasons` flagged severity warning/error. */
  warnings: ReasonEntry[];
  /** Field-level macros surfaced for the drawer. */
  unresolvedMacros: { field: string; value: string }[];
}

function pickString(src: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!src) return null;
  const v = src[key];
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function reason(
  code: ReasonCode,
  label: string,
  severity: ReasonEntry["severity"],
  extra?: { field?: string; value?: string }
): ReasonEntry {
  return { code, label, severity, ...extra };
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

export function scoreDonationDataQuality(input: ScoringInput): ScoringResult {
  const attr = input.attribution ?? {};
  const reasons: ReasonEntry[] = [];

  const utmSource = pickString(attr, "utm_source");
  const utmCampaign = pickString(attr, "utm_campaign");
  const utmContent = pickString(attr, "utm_content");
  const campaignId = pickString(attr, "campaign_id");
  const adId = pickString(attr, "ad_id");
  const adsetId =
    pickString(attr, "adset_id") ?? pickString(attr, "ad_group_id");
  const fbp = pickString(attr, "fbp");
  const fbc = pickString(attr, "fbc");
  const gaClient =
    pickString(attr, "ga_client_id") ?? pickString(attr, "client_id");
  const gaSession =
    pickString(attr, "ga_session_id") ?? pickString(attr, "session_id");
  const gaSource =
    pickString(attr, "ga_source") ?? pickString(attr, "ga4_source");
  const gaMedium =
    pickString(attr, "ga_medium") ?? pickString(attr, "ga4_medium");

  const conversionSent = !!input.conversionEventsSentAt;
  const conversionFailed = !!input.conversionFailedEventsSentAt;
  const isPaidStatus = input.status === "PAID";
  const isFailedDonation = input.status === "FAILED";

  const macros = detectUnresolvedMacros(input.attribution);
  for (const m of macros) {
    reasons.push(
      reason(
        "dynamic_macro_unresolved",
        `لم يتم استبدال متغير ديناميكي: ${m.field}`,
        "error",
        { field: m.field, value: m.value }
      )
    );
  }

  // Organic / direct paths short-circuit with no positive points.
  if (!input.platform || input.platform === "organic") {
    if (!utmSource && !gaSource) {
      reasons.push(
        reason("organic_or_direct", "لا يوجد utm أو إحالة", "info")
      );
    } else if (gaMedium && (gaMedium === "organic" || gaMedium === "referral")) {
      reasons.push(
        reason("organic_or_direct", `GA4 medium = ${gaMedium}`, "info", {
          field: "ga_medium",
          value: gaMedium,
        })
      );
    }
    return {
      confidence: macros.length > 0 ? 5 : 0,
      reasons,
      warnings: reasons.filter((r) => r.severity !== "info"),
      unresolvedMacros: macros,
    };
  }

  const platform = input.platform;
  const expectations = PLATFORM_EXPECTATIONS[platform];
  const platformClickIds = expectations?.clickIds ?? [];
  const clickIdHit = platformClickIds
    .map((k) => pickString(attr, k))
    .find((v): v is string => !!v);

  let confidence = 0;

  // Step 1: utm + identifier presence
  if (utmSource) {
    confidence += 20;
    reasons.push(
      reason("utm_source_present", `utm_source = ${utmSource}`, "info", {
        field: "utm_source",
        value: utmSource,
      })
    );
  }
  if (utmCampaign) {
    confidence += 5;
    reasons.push(
      reason("utm_campaign_present", `utm_campaign موجود`, "info", {
        field: "utm_campaign",
        value: utmCampaign,
      })
    );
  }
  if (utmContent) {
    confidence += 5;
    reasons.push(
      reason("utm_content_present", `utm_content موجود`, "info", {
        field: "utm_content",
        value: utmContent,
      })
    );
  }
  if (campaignId) {
    confidence += 5;
    reasons.push(reason("campaign_id_present", "معرف الحملة موجود", "info"));
  } else if (utmCampaign && platform !== "other-paid") {
    reasons.push(reason("missing_campaign_id", "معرف الحملة مفقود", "warning"));
  }
  if (adsetId) {
    confidence += 3;
    reasons.push(reason("adset_id_present", "معرف المجموعة الإعلانية موجود", "info"));
  }
  if (adId) {
    confidence += 5;
    reasons.push(reason("ad_id_present", "معرف الإعلان موجود", "info"));
  } else if (campaignId && platform !== "other-paid") {
    reasons.push(reason("missing_ad_id", "معرف الإعلان مفقود", "warning"));
  }

  // Step 2: click id
  if (clickIdHit) {
    confidence += 30;
    reasons.push(
      reason("click_id_present", "click id موجود", "info", {
        field: platformClickIds.join("/"),
      })
    );
  } else if (platform !== "other-paid") {
    const expected = platformClickIds.join(" / ");
    let code: ReasonCode = "utm_without_click_id";
    if (platform === "meta") code = "fbclid_or_fbc_missing";
    else if (platform === "google") code = "gclid_or_gbraid_missing";
    else if (platform === "tiktok") code = "ttclid_missing";
    else if (platform === "x") code = "twclid_missing";
    reasons.push(
      reason(
        code,
        expected ? `${expected} مفقود` : "click id مفقود",
        "warning"
      )
    );
  }

  // Step 3: Meta cookies for browser↔CAPI dedup
  if (platform === "meta") {
    if (fbp && fbc) {
      confidence += 10;
      reasons.push(reason("fbp_fbc_present", "fbp و fbc موجودان", "info"));
    } else {
      reasons.push(reason("fbp_fbc_missing", "fbp/fbc ناقصان — match quality منخفضة", "warning"));
    }
  }

  // Step 4: server-side conversion confirmation.
  //
  // `conversionEventsSentAt` is owned by the Meta CAPI + GA4 MP pipeline.
  // It is Meta-specific in spirit (CAPI = Meta Conversions API), so the
  // missing/failed warnings only make sense for Meta-attributed donations.
  // For Google Ads / TikTok / X / other-paid we don't yet have a server
  // conversion pipeline — absence isn't a defect of the donation. We still
  // reward the platform-agnostic GA4 purchase signal when it's present.
  if (isPaidStatus) {
    if (platform === "meta") {
      if (conversionSent && !conversionFailed) {
        confidence += 20;
        reasons.push(reason("capi_donate_sent", "CAPI Donate أُرسل", "info"));
      } else if (conversionFailed && !conversionSent) {
        reasons.push(
          reason(
            "capi_donate_failed_only",
            "CAPI أرسل DonateFailed فقط — لم يصل Donate",
            "error"
          )
        );
      } else if (!conversionSent) {
        reasons.push(reason("capi_donate_missing", "CAPI Donate لم يُرسل", "warning"));
      }
    } else if (conversionSent && !conversionFailed) {
      confidence += 15;
      reasons.push(reason("capi_donate_sent", "حدث التحويل الخادمي أُرسل (GA4)", "info"));
    }
  }

  // Step 5: GA4 signals
  if (gaClient || gaSession) {
    confidence += 4;
    reasons.push(reason("ga4_session_present", "GA4 client/session متوفر", "info"));
  } else {
    reasons.push(
      reason("ga4_client_or_session_missing", "بيانات GA4 (client/session) ناقصة", "warning")
    );
  }
  if (gaMedium && PAID_MEDIUMS.has(gaMedium.toLowerCase())) {
    confidence += 5;
    reasons.push(
      reason("ga4_source_paid", `GA4 medium = ${gaMedium}`, "info", {
        field: "ga_medium",
        value: gaMedium,
      })
    );
  }
  if (!gaSource && !utmSource) {
    reasons.push(reason("ga4_purchase_missing", "GA4 purchase لم يُسجَّل", "warning"));
  }

  // Step 6: failed donation under an ad is a tracking issue (no revenue but
  // still counts against attribution health).
  if (isFailedDonation && (utmSource || clickIdHit)) {
    reasons.push(reason("donation_failed_under_ad", "تبرع فاشل تحت إعلان", "error"));
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    confidence,
    reasons,
    warnings: reasons.filter((r) => r.severity !== "info"),
    unresolvedMacros: macros,
  };
}
