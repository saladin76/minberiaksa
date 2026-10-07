import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const COUNTRY_TIMEZONES: Record<string, string> = {
  TR: "Europe/Istanbul", SA: "Asia/Riyadh", AE: "Asia/Dubai", PS: "Asia/Hebron", IL: "Asia/Jerusalem",
  EG: "Africa/Cairo", JO: "Asia/Amman", QA: "Asia/Qatar", KW: "Asia/Kuwait", BH: "Asia/Bahrain", OM: "Asia/Muscat",
  IQ: "Asia/Baghdad", SY: "Asia/Damascus", LB: "Asia/Beirut", YE: "Asia/Aden", MA: "Africa/Casablanca",
  DZ: "Africa/Algiers", TN: "Africa/Tunis", LY: "Africa/Tripoli", SD: "Africa/Khartoum", SO: "Africa/Mogadishu",
  FR: "Europe/Paris", DE: "Europe/Berlin", NL: "Europe/Amsterdam", BE: "Europe/Brussels", GB: "Europe/London",
  IE: "Europe/Dublin", ES: "Europe/Madrid", PT: "Europe/Lisbon", IT: "Europe/Rome", CH: "Europe/Zurich",
  AT: "Europe/Vienna", SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen", FI: "Europe/Helsinki",
  PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava", HU: "Europe/Budapest", RO: "Europe/Bucharest",
  BG: "Europe/Sofia", GR: "Europe/Athens", AL: "Europe/Tirane", BA: "Europe/Sarajevo", XK: "Europe/Belgrade",
  MK: "Europe/Skopje", RS: "Europe/Belgrade", HR: "Europe/Zagreb", SI: "Europe/Ljubljana", UA: "Europe/Kyiv",
  GE: "Asia/Tbilisi", AZ: "Asia/Baku", RU: "Europe/Moscow",
  US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City", BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago", CO: "America/Bogota", PE: "America/Lima",
  VE: "America/Caracas", EC: "America/Guayaquil",
  IN: "Asia/Kolkata", PK: "Asia/Karachi", BD: "Asia/Dhaka", LK: "Asia/Colombo", NP: "Asia/Kathmandu",
  ID: "Asia/Jakarta", MY: "Asia/Kuala_Lumpur", SG: "Asia/Singapore", PH: "Asia/Manila", TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh", JP: "Asia/Tokyo", KR: "Asia/Seoul", CN: "Asia/Shanghai", HK: "Asia/Hong_Kong",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg", NG: "Africa/Lagos", GH: "Africa/Accra", KE: "Africa/Nairobi", TZ: "Africa/Dar_es_Salaam",
  UG: "Africa/Kampala", ET: "Africa/Addis_Ababa",
};

function normalizeCountry(value?: string | null): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function recipientCountryCode(input: { country?: string | null; phone?: string | null }): string | null {
  const stored = normalizeCountry(input.country);
  if (stored) return stored;
  const phone = String(input.phone ?? "").trim();
  if (!phone) return null;
  try {
    const parsed = parsePhoneNumberFromString(phone);
    return parsed?.country ? String(parsed.country as CountryCode) : null;
  } catch {
    return null;
  }
}

/**
 * Returns one practical IANA zone for the recipient's country.
 * Countries with multiple time zones use the main population/business zone; if the country cannot
 * be resolved, the campaign's configured fallback is returned.
 */
export function recipientTimeZone(
  input: { country?: string | null; phone?: string | null },
  fallback = "Europe/Istanbul",
): string {
  const country = recipientCountryCode(input);
  return (country && COUNTRY_TIMEZONES[country]) || fallback;
}
