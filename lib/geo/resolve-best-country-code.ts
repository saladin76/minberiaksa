import { countryCodeFromPhone } from "@/lib/donations/donor-country-code";

/** Source of the resolved country code, for logging/debugging. */
export type CountryCodeSource =
  | "EXISTING"
  | "PHONE"
  | "SERVER_GEO"
  | "CLIENT_GEO"
  | "NONE";

export interface BestCountryCodeInput {
  /** Whatever is already stored on the user; "XX" or non-2-letter is treated as empty. */
  existing?: string | null;
  /** E.164 or near-E.164 phone string; parsed via libphonenumber-js. */
  phone?: string | null;
  /** Country code from request-side detection (Vercel header / CF / ipapi). */
  serverGeo?: string | null;
  /** Country code provided by the browser (e.g. /api/geo/client → POST body). */
  clientGeo?: string | null;
}

export interface BestCountryCodeResult {
  code: string | null;
  source: CountryCodeSource;
  /**
   * True when the chosen code disagrees with at least one other valid signal —
   * useful for logging "this row's IP says TR but the phone says EG" cases so
   * admins can investigate suspect data later.
   */
  conflict: boolean;
}

function normalize(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const t = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t) || t === "XX") return null;
  return t;
}

/**
 * Pick the most trustworthy ISO-3166-1 alpha-2 country code for a user from
 * the available signals.
 *
 * Priority (highest first):
 *   1. `phone`     — derived from the user's phone-number dial code; the
 *      strongest signal because the donor types it themselves and it survives
 *      VPN / proxy / mobile-carrier IP mismatches that wreck IP geolocation.
 *      This overrides `existing` deliberately: the stored value is usually
 *      itself the result of an earlier IP detection, and Meta CAPI matching
 *      ended up shipping the wrong country for donors whose carriers proxied
 *      through a third country.
 *   2. `existing`  — already on the user record. Used when no phone is on
 *      file or the phone has no parseable country.
 *   3. `serverGeo` — Vercel / Cloudflare edge header, or ipapi.co server-side
 *      lookup. Reliable except for VPN / proxy / mobile carrier routing.
 *   4. `clientGeo` — browser-supplied geo (after fallback). Last resort.
 *
 * `conflict` is set when the chosen source disagrees with any other valid
 * signal, so callers can `console.warn` for follow-up triage without overriding
 * the chosen value.
 */
export function resolveBestCountryCode(input: BestCountryCodeInput): BestCountryCodeResult {
  const existing = normalize(input.existing);
  const phone = normalize(countryCodeFromPhone(input.phone ?? null));
  const serverGeo = normalize(input.serverGeo);
  const clientGeo = normalize(input.clientGeo);

  const candidates: Array<[CountryCodeSource, string | null]> = [
    ["PHONE", phone],
    ["EXISTING", existing],
    ["SERVER_GEO", serverGeo],
    ["CLIENT_GEO", clientGeo],
  ];

  const chosen = candidates.find(([, v]) => v != null);
  if (!chosen || !chosen[1]) {
    return { code: null, source: "NONE", conflict: false };
  }

  const [source, code] = chosen;
  const others = candidates
    .filter(([s, v]) => s !== source && v != null)
    .map(([, v]) => v);
  const conflict = others.some((v) => v !== code);

  return { code, source, conflict };
}
