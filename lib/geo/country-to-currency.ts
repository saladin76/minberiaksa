// Maps an ISO-3166-1 alpha-2 country code to a supported display currency.
// Used by the edge middleware on first visit so guests see prices in their
// local currency before any explicit selection.
//
// The output is always a code from `SUPPORTED_CURRENCY_OPTIONS`. Countries
// whose national currency is not in our supported set fall back to USD.

import { SUPPORTED_CURRENCY_CODES } from "@/lib/supported-currencies";

// Eurozone members — countries that officially use the Euro.
const EUROZONE = new Set<string>([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
  // De-facto Euro users (no own currency)
  "AD", "MC", "SM", "VA", "ME", "XK",
]);

const DIRECT_MAP: Record<string, string> = {
  GB: "GBP", // United Kingdom
  IM: "GBP", JE: "GBP", GG: "GBP", // Crown dependencies
  CA: "CAD",
  AU: "AUD",
  NZ: "AUD", // No NZD support — closest match
  TR: "TRY",
  SA: "SAR",
  AE: "AED",
  KW: "KWD",
  QA: "QAR",
  BH: "BHD",
  OM: "OMR",
  JO: "JOD",
  MA: "MAD",
  // Egypt → USD by policy (EGP intentionally removed from supported set).
  EG: "USD",
  US: "USD",
};

const FALLBACK = "USD";

/**
 * Pick a supported currency for a country. Returns `null` for invalid input so
 * callers can decide whether to apply a fallback or skip the cookie write
 * entirely (e.g. when geo headers are missing).
 */
export function currencyForCountry(
  countryCode: string | null | undefined
): string | null {
  if (!countryCode) return null;
  const code = String(countryCode).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;

  if (EUROZONE.has(code)) return "EUR";
  const mapped = DIRECT_MAP[code];
  if (mapped && SUPPORTED_CURRENCY_CODES.includes(mapped)) return mapped;
  return FALLBACK;
}
