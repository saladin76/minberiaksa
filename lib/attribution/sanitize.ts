import type { Prisma } from "@prisma/client";

export const DONATION_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_group_id",
  "ad_group_name",
  "ad_id",
  "ad_name",
  "creative_id",
  "creative_name",
  "placement",
  "publisher_platform",
  "site_source_name",
  "platform",
  "device",
  "device_platform",
  "network",
  "matchtype",
  "keyword",
  "target_id",
  "loc_interest",
  "loc_physical",
  "audience_type",
  "audience_segment",
  "message_variant",
  "channel",
  "twilio_campaign_id",
  "twilio_template_id",
  "target_country",
  "target_region",
  "language",
  "locale",
  "currency",
  "funnel",
  "objective",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "twclid",
  "fbp",
  "fbc",
  "ga_client_id",
  "ga_session_id",
  "session_id",
  "landing_page",
  "first_landing_page",
  "conversion_page",
  "referrer",
  "first_referrer",
  "_ga",
  "user_agent",
  "client_ip",
  "country_code",
  "country",
  "city",
  "region",
  "state",
  "zip",
  "postal_code",
  "tracking_quality_warnings",
] as const;

export type DonationAttributionKey = (typeof DONATION_ATTRIBUTION_KEYS)[number];

const MACRO_PATTERNS = ["{{", "}}", "__CAMPAIGN_", "__ADGROUP_", "__AD_", "__PLACEMENT_", "__CREATIVE_"];

function hasUnresolvedMacro(value: string): boolean {
  return MACRO_PATTERNS.some((pattern) => value.includes(pattern));
}

function normalizeLanguage(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  const aliases: Record<string, string> = {
    arabic: "ar",
    ar: "ar",
    english: "en",
    en: "en",
    french: "fr",
    fr: "fr",
    turkish: "tr",
    tr: "tr",
    indonesian: "id",
    id: "id",
    portuguese: "pt",
    pt: "pt",
    spanish: "es",
    es: "es",
  };
  return aliases[v] ?? (v.length <= 8 ? v : undefined);
}

function normalizePlatform(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  const aliases: Record<string, string> = {
    facebook: "meta",
    fb: "meta",
    instagram: "meta",
    meta: "meta",
    google: "google_ads",
    googleads: "google_ads",
    google_ads: "google_ads",
    tiktok: "tiktok",
    x: "x",
    twitter: "x",
    twilio: "twilio",
    whatsapp: "whatsapp",
    sms: "sms",
    email: "email",
  };
  return aliases[v] ?? v.slice(0, 80);
}

function normalizeCountry(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return v.length === 2 ? v.toUpperCase() : v.slice(0, 80);
}

function qualityWarnings(out: Record<string, string>): string[] {
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(out)) {
    if (key.endsWith("_unresolved") || hasUnresolvedMacro(value)) warnings.push(`unresolved_macro:${key.replace(/_unresolved$/, "")}`);
  }
  const platform = normalizePlatform(out.platform ?? out.utm_source);
  if (platform === "meta" && !out.fbclid && !out.fbc && !out.fbp) warnings.push("meta_missing_fb_click_ids");
  if (platform === "google_ads" && !out.gclid && !out.gbraid && !out.wbraid) warnings.push("google_missing_click_ids");
  if (platform === "tiktok" && !out.ttclid) warnings.push("tiktok_missing_ttclid");
  if (platform === "x" && !out.twclid) warnings.push("x_missing_twclid");
  return warnings;
}

export function sanitizeDonationAttribution(raw: unknown): Prisma.InputJsonValue | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of DONATION_ATTRIBUTION_KEYS) {
    const v = src[key];
    if (v == null) continue;
    const s = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (!s) continue;
    if (hasUnresolvedMacro(s)) {
      out[`${key}_unresolved`] = "true";
      continue;
    }
    out[key] = s.slice(0, 2048);
  }

  const lang = normalizeLanguage(out.language ?? out.locale);
  if (lang) {
    out.language = lang;
    out.locale = out.locale || lang;
  }
  if (out.currency) out.currency = out.currency.toUpperCase().slice(0, 3);
  const targetCountry = normalizeCountry(out.target_country ?? out.country_code ?? out.country);
  if (targetCountry) out.target_country = targetCountry;
  const platform = normalizePlatform(out.platform ?? out.publisher_platform ?? out.site_source_name ?? out.utm_source);
  if (platform) out.platform = platform;

  const warnings = qualityWarnings(out);
  if (warnings.length) out.tracking_quality_warnings = warnings.join(",");

  return Object.keys(out).length > 0 ? out : undefined;
}
