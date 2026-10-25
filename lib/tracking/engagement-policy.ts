/**
 * Measurement-only policy. Never use these URLs to navigate, create an order,
 * change a currency cookie, or attribute a server-confirmed donation.
 */
import { redactAnalyticsPath } from "./private-path";

export const ENGAGEMENT_MEASUREMENT_VERSION = "2";

export function isMeasurementHost(
  hostname: string,
  environment = process.env.NODE_ENV,
  allowedHosts = process.env.NEXT_PUBLIC_CLARITY_ALLOWED_HOSTS,
): boolean {
  if (environment !== "production") return false;
  const hosts = allowedHosts?.trim()
    ? allowedHosts.split(",").map((host) => host.trim().toLowerCase())
    : ["minberiaksa.org", "www.minberiaksa.org"];
  const current = hostname.toLowerCase().replace(/\.$/, "");
  return hosts.some((host) => /^[a-z0-9.-]+$/.test(host) && host === current);
}

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const CLICK_KEYS = ["fbclid", "gclid", "gbraid", "wbraid", "ttclid", "msclkid", "dclid"] as const;
const AD_CLICK_KEYS = ["gclid", "gbraid", "wbraid", "ttclid", "msclkid", "dclid"] as const;
const PAID_MEDIA = new Set([
  "cpc", "ppc", "paid", "paidsearch", "paid_search", "paid-social",
  "paid_social", "paidsocial", "display", "cpm", "cpv", "paid_video", "retargeting",
]);

function safeLabel(value: string): string | undefined {
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // Labels are not a channel for emails, credentials, or arbitrary URLs.
  if (!text || /@|:\/\//.test(text)) return undefined;
  return text.slice(0, 100);
}

export function landingAttribution(params: URLSearchParams): Record<string, string | number> {
  const tags: Record<string, string | number> = {
    measurement_version: ENGAGEMENT_MEASUREMENT_VERSION,
  };
  for (const key of CAMPAIGN_KEYS) {
    const value = params.get(key);
    const safe = value ? safeLabel(value) : undefined;
    if (safe) tags[key] = safe;
  }
  for (const key of CLICK_KEYS) {
    // The attribution owner retains click IDs. Engagement only needs presence.
    tags["has_" + key] = params.get(key) ? 1 : 0;
  }
  const medium = params.get("utm_medium")?.trim().toLowerCase() ?? "";
  const paid = medium ? PAID_MEDIA.has(medium) : AD_CLICK_KEYS.some((key) => !!params.get(key));
  const tagged = [...CAMPAIGN_KEYS, ...CLICK_KEYS].some((key) => !!params.get(key));
  tags.is_paid_traffic = paid ? 1 : 0;
  tags.has_campaign_tags = tagged ? 1 : 0;
  tags.traffic_type = paid ? "paid" : tagged ? "tagged" : "unattributed";
  tags.traffic_classification = medium
    ? paid ? "paid_medium" : "other_medium"
    : paid ? "ad_click_id" : tagged ? "tags_only" : "no_tags";
  return tags;
}

const NON_ROUTING_QUERY_KEYS = new Set(["currency", "t", "token", "accesstoken", "access_token", "donationid", "email", "phone"]);

/** Currency/credential cleanup is not another page. Real filter changes still are. */
export function measurementRouteKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (NON_ROUTING_QUERY_KEYS.has(key.toLowerCase())) params.delete(key);
  }
  params.sort();
  const query = params.toString();
  return (pathname || "/") + (query ? "?" + query : "");
}

export function measurementPath(pathname: string): string {
  return redactAnalyticsPath(pathname);
}

const PUBLIC_QUERY_KEYS = new Set([...CAMPAIGN_KEYS, "page", "category", "sort", "tab", "type"]);

export function measurementUrl(raw: string, base?: string): string | undefined {
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const query = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (!PUBLIC_QUERY_KEYS.has(key)) continue;
      const safe = safeLabel(value);
      if (safe) query.append(key, safe);
    }
    query.sort();
    return url.origin + measurementPath(url.pathname) + (query.size ? "?" + query.toString() : "");
  } catch {
    return undefined;
  }
}

export function referrerOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

const LABEL_KEYS = new Set([
  ...CAMPAIGN_KEYS, "measurement_version", "traffic_type", "traffic_classification",
  "target_host", "target_tag", "referrer_host",
]);
const NUMBER_KEYS = new Set([
  ...CLICK_KEYS.map((key) => "has_" + key), "is_paid_traffic", "has_campaign_tags",
  "ms_since_navigation_start", "hidden_for_ms", "samples",
]);

export function sanitizeEngagementData(data: Record<string, unknown> = {}): Record<string, string | number> {
  const safe: Record<string, string | number> = { measurement_version: ENGAGEMENT_MEASUREMENT_VERSION };
  for (const [key, value] of Object.entries(data)) {
    if (NUMBER_KEYS.has(key) && typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (LABEL_KEYS.has(key) && typeof value === "string") {
      const label = safeLabel(value);
      if (label) safe[key] = label;
    } else if ((key === "path" || key === "page") && typeof value === "string" && value.startsWith("/")) {
      safe[key] = measurementPath(value.split(/[?#]/, 1)[0]);
    } else if (key === "href" && typeof value === "string") {
      const url = measurementUrl(value);
      if (url) safe[key] = url;
    } else if (key === "referrer" && typeof value === "string") {
      const origin = referrerOrigin(value);
      if (origin) safe[key] = origin;
    } else if (key === "search" && typeof value === "string") {
      const url = measurementUrl("https://measurement.invalid/?" + value);
      const query = url ? new URL(url).search.slice(1) : "";
      if (query) safe[key] = query;
    }
  }
  return safe;
}

/** Three nearby presses describe a burst; they do not prove a failed action. */
export function createPointerBurstDetector() {
  let samples: { x: number; y: number; t: number }[] = [];
  let fired = false;
  return (sample: { x: number; y: number; t: number }): number | undefined => {
    samples = samples.filter((item) => sample.t - item.t >= 0 && sample.t - item.t <= 1000);
    samples.push(sample);
    if (samples.length < 3) fired = false;
    if (fired || samples.length < 3) return;
    if (!samples.every((item) => Math.hypot(item.x - sample.x, item.y - sample.y) <= 50)) return;
    fired = true;
    return samples.length;
  };
}
