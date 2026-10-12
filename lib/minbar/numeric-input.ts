/**
 * Input sanitisers for amount and card fields.
 *
 * Donors type on Arabic, Persian/Urdu and European keyboards. A bare
 * `replace(/[^0-9]/g, "")` drops Arabic-Indic digits (the field stays empty)
 * and drops the decimal point, so "12.50" became 1250.
 */

/** ٠–٩ (Arabic-Indic) and ۰–۹ (Extended, used by Urdu/Persian) to 0–9. */
export function toLatinDigits(raw: string): string {
  return String(raw ?? "").replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Digits only (card number, expiry, CVC, share counts). */
export function digitsOnly(raw: string, maxLength?: number): string {
  const out = toLatinDigits(raw).replace(/[^0-9]/g, "");
  return maxLength ? out.slice(0, maxLength) : out;
}

/**
 * A money amount as typed: digits and at most one decimal point with two
 * places. The Arabic decimal separator "٫" counts as a point, and so does a
 * comma followed by one or two digits at the end ("12,50" on a Turkish or
 * German keyboard); any other comma is read as a thousands separator.
 */
export function decimalAmount(raw: string, maxIntegerDigits = 7): string {
  let s = toLatinDigits(raw).replace(/٫/g, ".").replace(/٬/g, "");
  if (!s.includes(".") && /,\d{1,2}$/.test(s)) s = s.replace(/,(\d{1,2})$/, ".$1");
  s = s.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s.slice(0, maxIntegerDigits);
  const whole = s.slice(0, dot).slice(0, maxIntegerDigits);
  const fraction = s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

/** Parses what `decimalAmount` produced (or any typed amount); NaN-safe → 0. */
export function parseAmount(raw: unknown): number {
  const n = Number.parseFloat(decimalAmount(String(raw ?? ""), 12));
  return Number.isFinite(n) ? n : 0;
}
