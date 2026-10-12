/**
 * A major-unit amount in the smallest unit Stripe expects for the currency.
 *
 * Most currencies have two decimals (×100). Stripe treats the Gulf dinars and
 * the Omani rial as three-decimal currencies (×1000) and requires those amounts
 * to be a multiple of 10, so the last digit is rounded away. A plain ×100 there
 * charges a tenth of the donation. See https://docs.stripe.com/currencies.
 */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function toStripeMinorUnits(amount: number, currency: string): number {
  const c = String(currency || "usd").toLowerCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(amount);
  if (THREE_DECIMAL.has(c)) return Math.round(amount * 100) * 10;
  return Math.round(amount * 100);
}
