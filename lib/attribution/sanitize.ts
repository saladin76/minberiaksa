import type { Prisma } from "@prisma/client";

export const DONATION_ATTRIBUTION_KEYS = [
  "attribution_origin",
  "acquisition_kind",
  "source_capture",
  "source_captured_at",
  "snap_click_id",
  "scid",
  "scclid",
  "li_fat_id",
  "rdt_cid",
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
  "dclid",
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

/** Raw attribution URLs can include a receipt access token (?t=...). NEVER
 * persist, link or send those credentials to an advertising provider.
 * Keep benign UTM/click parameters intact for exact campaign reconciliation.
 */
// Attribution URLs are shared with dashboards and Meta CAPI. Only retain known
// campaign/click parameters: a denylist alone misses aliases such as receiptToken.
const SAFE_ATTRIBUTION_QUERY = /^(?:utm_[a-z0-9_]+|fbclid|fbc|fbp|gclid|dclid|gbraid|wbraid|ttclid|twclid|scclid|scid|sccid|msclkid|snap_click_id|li_fat_id|rdt_cid|campaign_id|adgroup_id|ad_group_id|adset_id|ad_id|creative_id|placement|publisher_platform|network|matchtype|keyword|ref|source|medium|campaign)$/i;
const SENSITIVE_ATTRIBUTION_QUERY = /(?:token|secret|pass(?:word|code)|credential|authorization|auth(?:entication)?|api[_-]?key|receipt|session|nonce|signature|csrf|otp|jwt|ticket|(?:^|[_-])(?:t|code|key)(?:$|[_-]))/i;
const ATTRIBUTION_URL_FIELDS = new Set(["landing_page", "first_landing_page", "conversion_page", "referrer", "first_referrer"]);

/** An acquisition URL must never expose a private receipt/login/payment route
 * or an opaque credential embedded in the pathname. Removing query tokens
 * alone cannot protect /receipt/<guest-token> or encoded variants. */
const PRIVATE_ATTRIBUTION_SEGMENT = /^(?:success|thank-?you|payment(?:-success|-failure|-failed|-processing)?|donation-success|donation-failed|receipts?|certificates?|invoices?|dashboard|admin|auth|signin|login|logout|account|profile|donor|verify|verification|reset(?:-password)?|callback|webhook|unsubscribe|guest|download|private|access(?:-token)?|tokens?)$/i;
const OPAQUE_ATTRIBUTION_SEGMENT = /^(?=.{32,}$)(?=.*[a-z])(?=.*[0-9])[a-z0-9_-]+$/i;
function attributionPathSegments(pathname: string): string[] | null {
  try {
    // Decode nested path encodings so /%2572eceipt/<token> is not missed.
    let decoded = pathname;
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    return decoded.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

export function safeAttributionUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    const pathSegments = attributionPathSegments(url.pathname);
    if (!pathSegments || pathSegments.some((part) => PRIVATE_ATTRIBUTION_SEGMENT.test(part) || OPAQUE_ATTRIBUTION_SEGMENT.test(part))) return null;
    for (const name of [...url.searchParams.keys()]) {
      if (!SAFE_ATTRIBUTION_QUERY.test(name) || SENSITIVE_ATTRIBUTION_QUERY.test(name)) url.searchParams.delete(name);
    }
    return url.toString().slice(0, 2048);
  } catch { return null; }
}

export function isPaymentReturnPage(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    // Inspect the original path: safeAttributionUrl intentionally rejects
    // private success routes and must not make the return-page test disappear.
    const segments = attributionPathSegments(url.pathname);
    return Boolean(segments?.some((part) =>
      /^(?:success|thank-?you|payment-success|payment-failed|payment-failure|payment-processing|donation-success|donation-failed)$/.test(part.toLowerCase())));
  } catch { return false; }
}

/** The current /success/{id}?t=... is NOT the campaign landing page.
 * Use the last genuine campaign entry; if it is a bank return or another
 * site, use the original first landing. Never invent a landing page.
 */
export function safeAcquisitionLandingPage(attribution: Record<string, unknown> | null | undefined): string | null {
  const attr = attribution ?? {};
  for (const candidate of [attr.landing_page, attr.first_landing_page]) {
    const safe = safeAttributionUrl(candidate);
    if (!safe || isPaymentReturnPage(safe)) continue;
    const host = new URL(safe).hostname.toLowerCase();
    if (host === "minberiaksa.org" || host.endsWith(".minberiaksa.org") || host === "minberiaksa.vercel.app") {
      return safe;
    }
  }
  return null;
}

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
  if (out.attribution_origin === "subscription_signup") return warnings;
  const platform = normalizePlatform(out.platform ?? out.utm_source);
  if (platform === "meta" && !out.fbclid && !out.fbc && !out.fbp) warnings.push("meta_missing_fb_click_ids");
  if (platform === "google_ads" && !out.gclid && !out.gbraid && !out.wbraid && !out.dclid) warnings.push("google_missing_click_ids");
  if (platform === "tiktok" && !out.ttclid) warnings.push("tiktok_missing_ttclid");
  if (platform === "x" && !out.twclid) warnings.push("x_missing_twclid");
  return warnings;
}

export function sanitizeDonationAttribution(raw: unknown): Prisma.InputJsonValue | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const original = raw as Record<string, unknown>;
  const src = { ...original, scclid: original.scclid || original.ScCid || original.sccid || original.sc_click_id } as Record<string, unknown>;
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
    const safe = ATTRIBUTION_URL_FIELDS.has(key) ? safeAttributionUrl(s) : s;
    if (!safe) continue;
    out[key] = safe.slice(0, 2048);
  }

  // A success/return URL is not an acquisition page; scrub it from the
  // legacy field before any downstream attribution or Meta event is emitted.
  const acquisition = safeAcquisitionLandingPage(out);
  if (acquisition) out.landing_page = acquisition;
  else delete out.landing_page;

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
