/**
 * What a donor's amount means, and the smallest one the site takes.
 *
 * The basket stores every line in USD (`MinbarCartItem.amount`), because the
 * rest of the site reads it that way. A figure the donor typed, or an admin's
 * preset in the donor's currency, is also kept exactly as it was given
 * (`MinbarCartItem.local`), so "1 TL" is shown and charged as 1 TL instead of
 * drifting through the dollar and back.
 *
 * `GlobalSettings.allowAnyAmount` (the payment gateways page) decides the
 * floor: off, every donation line is worth at least `MIN_DONATION_USD`; on,
 * any positive amount in any currency is taken as it is.
 */

export const MIN_DONATION_USD = 1;

/**
 * Rate drift between the page's rate and the server's (both come from the
 * hourly table) must not refuse an amount the page accepted.
 */
export const MIN_DONATION_USD_TOLERANCE = 0.97;

/** An amount exactly as the donor gave it, in their currency. */
export interface LocalAmount {
  amount: number;
  /** ISO 4217, never "DEFAULT". */
  currency: string;
}

/**
 * The smallest figure a donor in `code` may give when the floor is on: one
 * dollar at `rate`, rounded up to a figure worth typing (whole units once a
 * dollar is ten or more of them, cents otherwise).
 */
export function minDonationInCurrency(code: string, rate: number | null): number {
  if (code === "USD" || !(rate && rate > 0)) return MIN_DONATION_USD;
  const raw = MIN_DONATION_USD * rate;
  return raw >= 10 ? Math.ceil(raw) : Math.ceil(raw * 100) / 100;
}

/** A positive `local` block worth keeping on a line, or undefined. */
export function parseLocalAmount(value: unknown): LocalAmount | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { amount, currency } = value as { amount?: unknown; currency?: unknown };
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return undefined;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) || currency === "USD") return undefined;
  return { amount: Math.round(amount * 100) / 100, currency };
}

/**
 * The exact figure behind a cart line, if it has one: its `local` block, or
 * a row written before that field existed that stores a figure in a
 * non-USD `currency` directly (the category box, the home quick bar, zakat).
 */
export function lineLocal(item: { amount: number; currency?: string; local?: LocalAmount }): LocalAmount | undefined {
  if (item.local) return item.local;
  const code = String(item.currency || "USD").toUpperCase();
  return code !== "USD" && item.amount > 0 ? { amount: item.amount, currency: code } : undefined;
}

/**
 * Rewrite rows that store a figure in the visitor's currency directly into
 * the one form the basket reads (`amount` in USD, the figure in `local`).
 * Returns null when nothing needs rewriting; rows in another currency wait
 * until the visitor is in it (the order API converts them either way).
 */
export function healLegacyLocalRows<T extends { amount: number; currency: string; local?: LocalAmount }>(
  items: readonly T[],
  code: string,
  rate: number | null
): T[] | null {
  if (code === "USD" || !(rate && rate > 0)) return null;
  let changed = false;
  const next = items.map((item) => {
    if (item.local || String(item.currency).toUpperCase() !== code || !(item.amount > 0)) return item;
    changed = true;
    return { ...item, amount: item.amount / rate, currency: "USD", local: { amount: item.amount, currency: code } };
  });
  return changed ? next : null;
}
