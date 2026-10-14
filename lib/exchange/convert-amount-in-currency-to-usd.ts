/**
 * Server-side USD conversion using USD-base rates from the database
 * (refreshed hourly from ExchangeRate-API via cron, same formula as the web app).
 */

import { getUsdBaseRatesForServer } from "@/lib/exchange/rates-service";
import { normalizeCurrencyCode } from "@/lib/exchange/convert";

export function normalizeDonationCurrencyCode(currency: string): string {
  return normalizeCurrencyCode(currency);
}

/**
 * Converts an amount expressed in `currency` (donation/payment currency) to USD.
 * Uses the same convention as `useConvetToUSD`: amount_foreign / rate = USD.
 */
export async function convertAmountInCurrencyToUsd(
  amount: number,
  currency: string
): Promise<number> {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const code = normalizeDonationCurrencyCode(currency);
  if (code === "USD") return n;

  const rates = await getUsdBaseRatesForServer();
  const rate = rates[code];
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No exchange rate for currency: ${code}`);
  }
  return n / rate;
}
