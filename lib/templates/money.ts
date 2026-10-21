/** Use the payment's stored USD snapshot, never today's exchange rate. */
export function donationUsdAmount(donation: { amountUSD?: number | null; amount: number; currency: string }): number | null {
  if (typeof donation.amountUSD === "number" && Number.isFinite(donation.amountUSD)) return donation.amountUSD;
  return donation.currency.toUpperCase() === "USD" && Number.isFinite(donation.amount) ? donation.amount : null;
}

/** Keep fractional money intact; missing conversions must not render as zero. */
export function formatTemplateMoney(amount: number | null | undefined, locale?: string | null, currency?: string): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  let digits = 2;
  if (currency) {
    try { digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { /* default precision */ }
  }
  try { return new Intl.NumberFormat(locale || "en", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(amount); }
  catch { return new Intl.NumberFormat("en", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(amount); }
}
