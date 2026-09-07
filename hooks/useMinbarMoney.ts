"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import { useCurrency } from "@/context/CurrencyContext";

/**
 * Formats a USD figure in the visitor's selected currency.
 *
 * Two rules from `DEVELOPER_HANDOFF §10` shape this:
 *  - the symbol, the thousands separator and the decimal mark follow
 *    `Intl.NumberFormat(locale, {style: "currency"})`, so a German visitor sees
 *    `1.234 €` and an English one `$1,234`;
 *  - **the value never changes because of the language.** Conversion is driven
 *    by the currency cookie and the daily rate feed, which are independent of
 *    locale. Switching from English to German re-formats; it does not re-price.
 *
 * Stored amounts are USD. When rates have not loaded yet the USD figure is shown
 * formatted for the locale rather than a spinner or a blank — a missing rate
 * must never make a donation amount disappear.
 */
export function useMinbarMoney() {
  const locale = useLocale();
  const { convertToCurrency, getSelectedCurrency } = useCurrency() as {
    convertToCurrency: (value: number) => {
      convertedValue: number | null;
      currency: string | null;
    };
    getSelectedCurrency: () => string;
  };

  const format = useCallback(
    (usd: number, options?: Intl.NumberFormatOptions) => {
      const { convertedValue, currency } = convertToCurrency(usd);
      const value = convertedValue ?? usd;
      const code = currency && currency !== "DEFAULT" ? currency : "USD";
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: code,
          maximumFractionDigits: 0,
          ...options,
        }).format(value);
      } catch {
        // An unknown currency code or an ICU gap must not take the page down.
        return `${code} ${Math.round(value).toLocaleString(locale)}`;
      }
    },
    [convertToCurrency, locale]
  );

  /** Plain number formatting — counts, beneficiaries, years. */
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => {
      try {
        return new Intl.NumberFormat(locale, options).format(value);
      } catch {
        return String(value);
      }
    },
    [locale]
  );

  return { format, formatNumber, currency: getSelectedCurrency() };
}
