/**
 * Per-campaign custom names for the "share" donation unit on SHARES-mode campaigns.
 *
 * Stored on Campaign.shareLabels as Json:
 *   { "<locale>": { "singular": string, "plural": string } }
 *
 * e.g. a sheep-distribution campaign in two locales:
 *   {
 *     "ar": { "singular": "خروف", "plural": "خراف" },
 *     "en": { "singular": "sheep", "plural": "sheep" }
 *   }
 *
 * UI consumers call {@link resolveShareUnit} to get the right string for a
 * given (locale, count, kind). When the campaign-level config is missing or
 * incomplete, callers fall back to the generic translation strings.
 */

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

export const SHARE_LABEL_LOCALES = SUPPORTED_LOCALES;
export type ShareLabelLocale = SupportedLocale;

export interface ShareLabelEntry {
  singular: string;
  plural: string;
}

export type ShareLabelsConfig = Partial<Record<string, ShareLabelEntry>>;

/**
 * Defensive parser — admin-edited JSON might be partially filled or malformed.
 * Returns `null` when nothing usable is present (empty strings count as
 * missing, so the caller falls back to translations).
 */
export function parseShareLabels(raw: unknown): ShareLabelsConfig | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ShareLabelsConfig = {};
  for (const [locale, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!locale || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;
    const singular = typeof obj.singular === "string" ? obj.singular.trim() : "";
    const plural = typeof obj.plural === "string" ? obj.plural.trim() : "";
    if (!singular && !plural) continue;
    out[locale] = {
      // If only one form is given, reuse it for both (better than blank).
      singular: singular || plural,
      plural: plural || singular,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Pick the singular or plural unit name for a locale. Returns null if the
 * campaign hasn't defined one for this locale, so the caller can fall back.
 *
 * Pluralization rule: count === 1 → singular, otherwise → plural. (Most
 * locales we support follow this; for Arabic dual/plural edge cases we'd
 * need ICU rules, but the admin can set their preferred form in the plural
 * slot if they want a specific grammatical number.)
 */
export function resolveShareUnit(
  labels: ShareLabelsConfig | null | undefined,
  locale: string,
  count: number
): string | null {
  if (!labels) return null;
  const entry = labels[locale];
  if (!entry) return null;
  const want = count === 1 ? entry.singular : entry.plural;
  return want && want.trim() ? want : null;
}

/** Convenience: the locale's plural form (or null), used for "Shares" badges
 *  where we don't have a concrete count yet. */
export function resolveSharePlural(
  labels: ShareLabelsConfig | null | undefined,
  locale: string
): string | null {
  if (!labels) return null;
  const entry = labels[locale];
  if (!entry) return null;
  return entry.plural && entry.plural.trim() ? entry.plural : null;
}

/** Convenience: the locale's singular form (or null). */
export function resolveShareSingular(
  labels: ShareLabelsConfig | null | undefined,
  locale: string
): string | null {
  if (!labels) return null;
  const entry = labels[locale];
  if (!entry) return null;
  return entry.singular && entry.singular.trim() ? entry.singular : null;
}

/** Normalise admin-form input into a clean Prisma payload. Strips empty rows
 *  and trims whitespace. Returns `null` when nothing meaningful was entered
 *  (caller should write `null`/`undefined` to the DB so we don't store empty objects). */
export function buildShareLabelsPayload(
  rows: Record<string, { singular?: string; plural?: string } | null | undefined>
): ShareLabelsConfig | null {
  const out: ShareLabelsConfig = {};
  for (const locale of SHARE_LABEL_LOCALES) {
    const row = rows[locale];
    if (!row) continue;
    const singular = row.singular?.trim() ?? "";
    const plural = row.plural?.trim() ?? "";
    if (!singular && !plural) continue;
    out[locale] = {
      singular: singular || plural,
      plural: plural || singular,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}
