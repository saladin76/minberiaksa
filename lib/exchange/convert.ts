/**
 * Currency conversion against a USD-based rate table.
 *
 * Split out of `rates-service` because that module opens a Prisma client at import
 * time: the maths here is pure, and keeping it free of that dependency is what lets
 * it be tested directly.
 */

/**
 * Any supported currency → USD.
 *
 * The rate table is USD-based, so this is a single division: the round-trip
 * through TRY that `convertAmountInCurrencyToTry` needs does not apply, and the
 * result carries one rounding step instead of two.
 */
export function convertAmountInCurrencyToUsd(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>
): number {
  const from = String(fromCurrency || "USD")
    .trim()
    .toUpperCase();
  if (from === "USD") return amount;
  const rFrom = rates[from];
  if (!rFrom || rFrom <= 0) {
    throw new Error(`Missing USD-base rate for ${from}`);
  }
  return Math.round((amount / rFrom) * 100) / 100;
}

export function convertAmountInCurrencyToTry(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>
): number {
  const from = String(fromCurrency || "USD")
    .trim()
    .toUpperCase();
  if (from === "TRY") return amount;
  const rFrom = rates[from];
  const rTry = rates.TRY;
  if (!rFrom || !rTry || rFrom <= 0 || rTry <= 0) {
    throw new Error(`Missing USD-base rate for ${from} or TRY`);
  }
  const usd = amount / rFrom;
  const tryAmount = usd * rTry;
  return Math.round(tryAmount * 100) / 100;
}
