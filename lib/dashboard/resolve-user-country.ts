import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getCountryDisplayNameFromCode } from "./country-display-name";

interface UserCountryFields {
  countryCode?: string | null;
  country?: string | null;
  countryName?: string | null;
  phone?: string | null;
}

interface ResolvedUserCountry {
  /** Normalized ISO-3166-1 alpha-2 code (uppercase), or null when none could be resolved. */
  code: string | null;
  /** Display name aligned with `code` when present; falls back to legacy `countryName`/`country`. */
  name: string;
}

function normalizeCode(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const t = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(t) ? t : null;
}

function codeFromPhone(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
    return normalizeCode(parsed?.country);
  } catch {
    return null;
  }
}

/**
 * Pick a single country source so the flag and the country name can never
 * disagree. Prefers the structured `countryCode`; otherwise tries deriving
 * one from the phone number; legacy text fields are the last resort and are
 * only used when no ISO code can be produced.
 */
export function resolveUserCountry(user: UserCountryFields): ResolvedUserCountry {
  const code = normalizeCode(user.countryCode) ?? codeFromPhone(user.phone);
  if (code) {
    return { code, name: getCountryDisplayNameFromCode(code, "ar") };
  }
  const legacy = (user.countryName ?? user.country ?? "").trim();
  return { code: null, name: legacy || "—" };
}
