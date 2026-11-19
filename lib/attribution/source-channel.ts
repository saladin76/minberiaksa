/**
 * Where a donation came from, as one dashboard category (2026-11-19). Built from the attribution values
 * actually recorded on production donations: utm_source / platform (fb, ig, Meta, an, whatsapp, email,
 * google, google_ads…), utm_medium (paid_social, cpc, paid_search…), click ids in the landing URL, and the
 * referrer host when no UTM exists (l.instagram.com, lm.facebook.com, www.google.com, the Gmail app…).
 * Tagged values win over the referrer; no attribution at all is "unknown", never guessed.
 */
export const SOURCE_CHANNELS = ["facebook", "instagram", "whatsapp", "email", "google_ads", "google_search", "tiktok", "direct", "other", "unknown"] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

const OWN_HOSTS = /(^|\.)minberiaksa\.org$/i;
const PAYMENT_HOSTS = /(paypal\.com|stripe\.com|albaraka|payfor|qnb|3dsecure|acs\.|bkm\.com\.tr)/i;

function str(v: unknown): string { return typeof v === "string" ? v.trim().toLowerCase() : ""; }
function host(url: unknown): string {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  if (/^android-app:\/\//i.test(s)) return s.replace(/^android-app:\/\//i, "").split("/")[0].toLowerCase();
  try { return new URL(s).hostname.toLowerCase(); } catch { return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase() : ""; }
}
function param(url: unknown, name: string): boolean {
  if (typeof url !== "string" || !url.includes("?")) return false;
  try { return new URL(url, "https://x.invalid").searchParams.has(name); } catch { return false; }
}

export function classifySourceChannel(attribution: unknown): SourceChannel {
  if (!attribution || typeof attribution !== "object") return "unknown";
  const a = attribution as Record<string, unknown>;
  const source = str(a.utm_source) || str(a.platform);
  const medium = str(a.utm_medium);
  const landing = a.first_landing_page ?? a.landing_page;
  const ref = host(a.first_referrer) || host(a.referrer);
  const hasAnything = Boolean(source || medium || ref || str(a.landing_page) || str(a.first_landing_page) || str(a.session_id));
  if (!hasAnything) return "unknown";

  if (source) {
    if (/^(ig|instagram)$/.test(source) || source.includes("instagram")) return "instagram";
    if (/^(fb|facebook|meta|an|audience_network|messenger)$/.test(source) || source.includes("facebook")) return "facebook";
    if (source.includes("whatsapp") || source === "wa") return "whatsapp";
    if (/(^|[^a-z])(e-?mail|newsletter|mail)([^a-z]|$)/.test(source) || source === "email") return "email";
    if (source.includes("tiktok")) return "tiktok";
    if (source === "google_ads" || source === "google" || source.includes("adwords")) return "google_ads";
    return "other";
  }
  if (medium === "email") return "email";
  if (param(landing, "gclid") || param(landing, "gbraid") || param(landing, "wbraid")) return "google_ads";
  if (param(landing, "ttclid")) return "tiktok";
  if (param(landing, "fbclid") && ref.includes("instagram")) return "instagram";
  if (param(landing, "fbclid")) return "facebook";

  if (ref && !OWN_HOSTS.test(ref)) {
    if (ref.includes("instagram")) return "instagram";
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(ref)) return "facebook";
    if (ref.includes("whatsapp") || ref === "wa.me") return "whatsapp";
    if (ref === "com.google.android.gm" || /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/.test(ref)) return "email";
    if (ref.includes("tiktok")) return "tiktok";
    if (/(^|\.)google\.[a-z.]+$/.test(ref) || ref === "com.google.android.googlequicksearchbox") return "google_search";
    if (PAYMENT_HOSTS.test(ref)) return "direct";
    return "other";
  }
  return "direct";
}
