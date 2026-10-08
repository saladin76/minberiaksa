import type { AudienceChannel } from "./campaign-audience-accounting";

/** Execution-time formatting only; never changes audience membership. */
export function normalizeCampaignContact(
  channel: AudienceChannel,
  contact: string | null | undefined,
): string | null {
  const value = String(contact ?? "").trim();
  if (!value) return null;
  if (channel === "EMAIL") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  }
  // Strip formatting, not arbitrary characters. Letters, extensions, multiple
  // plus signs and national numbers without a country code must not silently
  // become a different international destination.
  const compact = value.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact.startsWith("+") ? compact : `+${compact}`;
  return /^\+[1-9]\d{6,14}$/.test(international) ? international : null;
}
