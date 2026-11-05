/** Shared by the link builder, saved-link copy flow and write API. */
export function blockedTrackingMacros(raw: string): string[] {
  let value = raw;
  for (let i = 0; i < 2; i++) { try { value = decodeURIComponent(value); } catch { break; } }
  return [...new Set(value.match(/\{\{\s*(?:device_platform|publisher_platform)\s*\}\}/gi) ?? [])];
}

export function hasTrackingMacros(raw: string): boolean {
  let value = raw;
  try { value = decodeURIComponent(value); } catch { /* Inspect the original. */ }
  return /\{\{.+?\}\}|__[A-Z0-9_]+__|\{(?:campaignid|adgroupid|creative|placement|device)\}/i.test(value);
}

export function resolvedTrackingIdentifier(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !hasTrackingMacros(text) ? text : null;
}

/** Keep platform placeholders readable in the Ads Manager parameters field. */
export function serializeAdParameters(params: Record<string, string>): string {
  return new URLSearchParams(params).toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
}

export function campaignSlug(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

const TRACKING_KEYS = new Set(["channel", "language", "campaign_id", "adset_id", "ad_id", "ad_group_id", "placement", "device", "platform", "publisher_platform", "device_platform", "target_country", "objective", "message_variant", "audience_segment", "messaging_campaign_id", "messaging_template_id", "button_id", "button_label", "link_position"]);
export function splitTrackingUrl(raw: string): { destination: string; parameters: string } | null {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const params: Record<string, string> = {};
    for (const [key, value] of [...url.searchParams]) {
      if (key.startsWith("utm_") || TRACKING_KEYS.has(key) || hasTrackingMacros(value)) { params[key] = value; url.searchParams.delete(key); }
    }
    return { destination: url.toString(), parameters: serializeAdParameters(params) };
  } catch { return null; }
}
