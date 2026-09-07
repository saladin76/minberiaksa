// Maps an ISO-3166-1 alpha-2 country code to a supported UI locale.
// Used by the edge middleware so guests landing on a URL without a locale
// prefix (e.g. a share link with `localeMode=auto`) get redirected into the
// locale that best matches their country instead of the hard-coded default.
//
// Unknown / ambiguous countries return `null` so the caller can fall back to
// the site's `defaultLocale`.

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES);

// Arab-League and majority-Arabic-speaking countries.
const ARABIC = new Set<string>([
  "SA", "AE", "KW", "QA", "BH", "OM", "JO", "PS", "LB", "SY",
  "IQ", "YE", "EG", "LY", "TN", "DZ", "MA", "MR", "SD", "SS",
  "SO", "DJ", "KM",
]);

// Primarily Francophone (incl. former French/Belgian territories where French
// is the lingua franca of public services).
const FRENCH = new Set<string>([
  "FR", "BE", "LU", "MC", "GP", "MQ", "RE", "GF", "YT", "PM",
  "NC", "PF", "WF", "BL", "MF", "TF",
  "SN", "CI", "ML", "BF", "NE", "TD", "MG", "CM", "CG", "CD",
  "BJ", "TG", "GN", "GA", "CF", "GQ", "BI", "RW", "HT", "VU",
]);

// Spanish-speaking countries.
const SPANISH = new Set<string>([
  "ES", "MX", "AR", "CL", "CO", "PE", "VE", "UY", "PY", "EC",
  "BO", "GT", "CR", "PA", "DO", "CU", "HN", "NI", "SV", "PR",
  "GQ",
]);

// Portuguese-speaking countries.
const PORTUGUESE = new Set<string>([
  "PT", "BR", "AO", "MZ", "CV", "GW", "ST", "TL",
]);

// German-speaking countries.
const GERMAN = new Set<string>(["DE", "AT", "CH", "LI"]);

// Indonesian.
const INDONESIAN = new Set<string>(["ID"]);

// Turkish (incl. Northern Cyprus).
const TURKISH = new Set<string>(["TR"]);

// Countries that are primarily English-speaking or where English is the
// dominant lingua franca for online services.
const ENGLISH = new Set<string>([
  "US", "GB", "IE", "AU", "NZ", "CA", "ZA", "IN", "PK", "BD",
  "LK", "PH", "SG", "MY", "HK", "MT", "JM", "TT", "BS", "BB",
  "BZ", "GH", "NG", "KE", "UG", "TZ", "ZM", "ZW", "BW", "NA",
  "RW", "MW", "GY", "SR", "FJ", "PG",
  "IM", "JE", "GG",
]);

/**
 * Pick a supported locale for a country. Returns `null` for unrecognized or
 * invalid input so the caller can decide on a fallback (typically the site's
 * `defaultLocale`).
 *
 * Order matters when a country could plausibly map to multiple supported
 * locales — we lean toward the locale most commonly used by online consumers
 * in that market.
 */
export function localeForCountry(
  countryCode: string | null | undefined
): SupportedLocale | null {
  if (!countryCode) return null;
  const code = String(countryCode).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;

  let picked: string | null = null;
  if (ARABIC.has(code)) picked = "ar";
  else if (TURKISH.has(code)) picked = "tr";
  else if (INDONESIAN.has(code)) picked = "id";
  else if (GERMAN.has(code)) picked = "de";
  else if (FRENCH.has(code)) picked = "fr";
  else if (PORTUGUESE.has(code)) picked = "pt";
  else if (SPANISH.has(code)) picked = "es";
  else if (ENGLISH.has(code)) picked = "en";

  return picked && SUPPORTED.has(picked) ? (picked as SupportedLocale) : null;
}
