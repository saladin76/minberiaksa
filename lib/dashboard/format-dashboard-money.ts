/**
 * Dashboard donation/stats money formatter: respects CurrencySelector.
 * - DEFAULT: show amounts in the row's original currency (local values).
 * - Specific currency: convert from USD when `amountUSD` is provided; otherwise show local with source symbol.
 */

export const DASHBOARD_DISPLAY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  SAR: "﷼",
  AED: "د.إ",
  KWD: "د.ك",
  EGP: "EGP ",
  QAR: "﷼",
  BHD: "ب.د",
  OMR: "ر.ع.‏",
};

type ConvertResult = {
  convertedValue: number | null;
  currency: string | null;
  exchangeRate?: number | null;
};

export function createFormatDashboardMoney(deps: {
  getSelectedCurrency: () => string;
  convertToCurrency: (valueInUsd: number) => ConvertResult;
}) {
  return function formatDashboardMoney(
    n: number,
    sourceCurrency?: string,
    amountUSD?: number | null,
    approximate?: boolean
  ): string {
    const decimals = approximate
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 2 };

    const selectedRaw = deps.getSelectedCurrency?.() ?? "DEFAULT";
    const selected = selectedRaw === "DEFAULT" ? "DEFAULT" : String(selectedRaw).trim().toUpperCase();
    const src = sourceCurrency ? String(sourceCurrency).trim().toUpperCase() : "";

    const symFor = (code: string) =>
      DASHBOARD_DISPLAY_SYMBOLS[code] ?? `${code} `;

    const valNum = typeof n === "number" && Number.isFinite(n) ? n : 0;
    const val = approximate ? Math.round(valNum) : valNum;

    // Default currency option = show each donation in its stored currency (local amounts).
    if (selected === "DEFAULT" && src) {
      return symFor(src) + val.toLocaleString(undefined, decimals);
    }

    if (src && src === selected) {
      return symFor(src) + val.toLocaleString(undefined, decimals);
    }

    const usd =
      amountUSD != null && Number.isFinite(Number(amountUSD)) ? Number(amountUSD) : null;
    if (usd != null) {
      const r = deps.convertToCurrency(usd);
      if (r?.convertedValue != null && r.currency) {
        const cv =
          typeof r.convertedValue === "number"
            ? approximate
              ? Math.round(r.convertedValue)
              : r.convertedValue
            : 0;
        return symFor(r.currency) + cv.toLocaleString(undefined, decimals);
      }
    }

    // Chart / summary values: `n` is already in USD, no per-row currency.
    if (!src) {
      if (selected === "DEFAULT") {
        return symFor("USD") + val.toLocaleString(undefined, decimals);
      }
      const r = deps.convertToCurrency(valNum);
      if (r?.convertedValue != null && r?.currency) {
        const cv =
          typeof r.convertedValue === "number"
            ? approximate
              ? Math.round(r.convertedValue)
              : r.convertedValue
            : 0;
        return symFor(r.currency) + cv.toLocaleString(undefined, decimals);
      }
      return symFor("USD") + val.toLocaleString(undefined, decimals);
    }

    if (src) {
      return symFor(src) + val.toLocaleString(undefined, decimals);
    }

    return "$" + val.toLocaleString(undefined, decimals);
  };
}

/** Prefer stored total charged; fall back to legacy `amount` only if missing. */
export function donationDisplayTotalLocal(d: {
  totalAmount?: number | null;
  amount?: number | null;
}): number {
  const t = d.totalAmount;
  if (t != null && Number.isFinite(Number(t))) return Number(t);
  return Number(d.amount ?? 0);
}
