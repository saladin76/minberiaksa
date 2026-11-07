import { parsePhoneNumberFromString, type MetadataJson } from "libphonenumber-js/core";
import * as phoneMetadata from "libphonenumber-js/metadata.min.json";
// TSX CLI JSON loaders and Next bundles expose different module shapes.
const metadata = ((phoneMetadata as unknown as { default?: unknown }).default ?? phoneMetadata) as MetadataJson;
import type { AudienceChannel } from "./campaign-audience-accounting";

/** Execution-time formatting only; never changes audience membership. */
export function normalizeCampaignContact(
  channel: AudienceChannel,
  contact: string | null | undefined,
): string | null {
  const value = String(contact ?? "").trim();
  if (!value) return null;
  if (channel === "EMAIL") {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
  }
  // Strip formatting, not arbitrary characters. Letters, extensions, multiple
  // plus signs and national numbers without a country code must not silently
  // become a different international destination.
  const compact = value.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact.startsWith("+") ? compact : `+${compact}`;
  if (!/^\+[1-9]\d{6,14}$/.test(international)) return null;
  const parsed = parsePhoneNumberFromString(international, metadata);
  return parsed?.isPossible() && parsed.isValid() && parsed.number === international ? international : null;
}
