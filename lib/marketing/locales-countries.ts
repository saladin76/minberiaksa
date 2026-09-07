/**
 * Shared locale + country catalogs for the Marketing Platform Connections
 * dashboard and (later) the Marketing Intelligence dashboard.
 *
 * Source of truth for locale / country normalization. Re-uses ISO 3166-1
 * alpha-2 country codes and the existing site locales.
 */

export const SUPPORTED_MARKETING_LOCALES = [
  "ar",
  "tr",
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "id",
] as const;

export type MarketingLocale = (typeof SUPPORTED_MARKETING_LOCALES)[number];

const LOCALE_LABEL_AR: Record<MarketingLocale, string> = {
  ar: "العربية",
  tr: "التركية",
  en: "الإنجليزية",
  fr: "الفرنسية",
  de: "الألمانية",
  es: "الإسبانية",
  pt: "البرتغالية",
  id: "الإندونيسية",
};

export const SUPPORTED_MARKETING_COUNTRIES = [
  "TR",
  "SA",
  "AE",
  "QA",
  "KW",
  "BH",
  "OM",
  "EG",
  "TN",
  "MA",
  "DZ",
  "FR",
  "DE",
  "US",
  "CA",
  "GB",
  "ID",
] as const;

export type MarketingCountryCode = (typeof SUPPORTED_MARKETING_COUNTRIES)[number];

const COUNTRY_LABEL_AR: Record<MarketingCountryCode, string> = {
  TR: "تركيا",
  SA: "السعودية",
  AE: "الإمارات",
  QA: "قطر",
  KW: "الكويت",
  BH: "البحرين",
  OM: "عُمان",
  EG: "مصر",
  TN: "تونس",
  MA: "المغرب",
  DZ: "الجزائر",
  FR: "فرنسا",
  DE: "ألمانيا",
  US: "الولايات المتحدة",
  CA: "كندا",
  GB: "المملكة المتحدة",
  ID: "إندونيسيا",
};

export function normalizeLocale(v: string | null | undefined): MarketingLocale | null {
  if (!v) return null;
  const lc = v.trim().toLowerCase().slice(0, 2);
  return (SUPPORTED_MARKETING_LOCALES as readonly string[]).includes(lc)
    ? (lc as MarketingLocale)
    : null;
}

export function normalizeCountryCode(
  v: string | null | undefined
): MarketingCountryCode | null {
  if (!v) return null;
  const up = v.trim().toUpperCase();
  return (SUPPORTED_MARKETING_COUNTRIES as readonly string[]).includes(up)
    ? (up as MarketingCountryCode)
    : null;
}

export function getLocaleLabel(v: string): string {
  const norm = normalizeLocale(v);
  return norm ? LOCALE_LABEL_AR[norm] : v;
}

export function getCountryLabel(v: string): string {
  const norm = normalizeCountryCode(v);
  return norm ? COUNTRY_LABEL_AR[norm] : v;
}

export function normalizeLocaleList(raw: unknown): MarketingLocale[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<MarketingLocale>();
  for (const x of raw) {
    const n = typeof x === "string" ? normalizeLocale(x) : null;
    if (n) out.add(n);
  }
  return [...out];
}

export function normalizeCountryList(raw: unknown): MarketingCountryCode[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<MarketingCountryCode>();
  for (const x of raw) {
    const n = typeof x === "string" ? normalizeCountryCode(x) : null;
    if (n) out.add(n);
  }
  return [...out];
}
