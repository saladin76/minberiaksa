/**
 * Shared contract for attribution + tracking diagnostics used by the Ads
 * Intelligence dashboard and (later) the Marketing Intelligence dashboard.
 *
 * The 8-status taxonomy mirrors what marketing teams reason about:
 *
 *   verified       — paid platform identified, click id present, server
 *                    conversion event confirmed (CAPI/GAds/TikTok/X).
 *   strong         — paid platform + click id but server confirmation missing
 *                    or partial cookies.
 *   likely_paid    — paid platform via utm/utm_medium without a native click id.
 *   ga4_inferred   — no native signals on the donation, but GA4 enrichment
 *                    (ga_source/ga_medium) says paid.
 *   utm_only       — utm_source/utm_campaign present, weak overall signal.
 *   organic        — utm_medium of organic/social/referral or referrer hints.
 *   direct         — no utm, no click id, no referrer — typed the URL.
 *   tracking_issue — paid status with broken signals (failed donation under
 *                    an ad, unresolved {{macros}}, conversion event failed).
 */
export type AttributionStatus =
  | "verified"
  | "strong"
  | "likely_paid"
  | "ga4_inferred"
  | "utm_only"
  | "organic"
  | "direct"
  | "tracking_issue";

export const ATTRIBUTION_STATUS_LABEL_AR: Record<AttributionStatus, string> = {
  verified: "إعلان مؤكد",
  strong: "تتبع قوي",
  likely_paid: "إعلان مرجّح",
  ga4_inferred: "مكتمل من GA4",
  utm_only: "من الرابط فقط",
  organic: "غير إعلاني",
  direct: "مباشر",
  tracking_issue: "خطأ تتبع",
};

export const ATTRIBUTION_STATUS_COLOR: Record<AttributionStatus, string> = {
  verified: "emerald",
  strong: "teal",
  likely_paid: "lime",
  ga4_inferred: "sky",
  utm_only: "amber",
  organic: "slate",
  direct: "slate",
  tracking_issue: "rose",
};

/** Statuses that count as "paid ad attributed" for revenue rollups. */
export const PAID_ATTRIBUTION_STATUSES: ReadonlySet<AttributionStatus> = new Set([
  "verified",
  "strong",
  "likely_paid",
  "ga4_inferred",
] as const);

/** Statuses that count as "non-ad" for revenue rollups (organic/direct buckets). */
export const NON_AD_ATTRIBUTION_STATUSES: ReadonlySet<AttributionStatus> = new Set([
  "organic",
  "direct",
] as const);

/**
 * Diagnostic reason codes — emitted by the attribution resolver so the UI can
 * render Arabic labels consistently across endpoints. Codes are stable; the
 * Arabic label may evolve.
 */
export type ReasonCode =
  // positive
  | "utm_source_present"
  | "click_id_present"
  | "fbp_fbc_present"
  | "ga4_session_present"
  | "ga4_source_paid"
  | "capi_donate_sent"
  | "stable_event_id_present"
  | "campaign_id_present"
  | "ad_id_present"
  | "adset_id_present"
  | "utm_content_present"
  | "utm_campaign_present"
  | "platform_match"
  | "attribution_looks_strong"
  // missing / warning
  | "fbclid_or_fbc_missing"
  | "gclid_or_gbraid_missing"
  | "ttclid_missing"
  | "twclid_missing"
  | "fbp_fbc_missing"
  | "capi_donate_missing"
  | "capi_donate_failed_only"
  | "browser_donate_missing"
  | "ga4_purchase_missing"
  | "ga4_client_or_session_missing"
  | "event_id_missing"
  | "utm_without_click_id"
  | "missing_campaign_id"
  | "missing_ad_id"
  | "dynamic_macro_unresolved"
  | "platform_mismatch"
  | "donation_failed_under_ad"
  | "organic_or_direct"
  | "no_paid_signals";

export interface ReasonEntry {
  code: ReasonCode;
  /** Arabic-friendly short description for UI. */
  label: string;
  /** Optional field name + raw value, for the drawer. */
  field?: string;
  value?: string;
  severity: "info" | "warning" | "error";
}

export interface TrackingEventAudit {
  metaBrowserDonate?: boolean | null;
  metaCapiDonate?: boolean | null;
  metaCapiDonateFailed?: boolean | null;
  ga4Purchase?: boolean | null;
  googleAdsConversion?: boolean | null;
  tiktokEvent?: boolean | null;
  xEvent?: boolean | null;
  /** Stable event id used to dedup browser <-> server (donate_{id}). */
  eventId?: string | null;
}
