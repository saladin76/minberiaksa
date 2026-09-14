import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";

/**
 * One currency formatter for the public site.
 *
 * `Intl.NumberFormat(locale, { style: "currency" })` gets the separators, the
 * decimal mark and the symbol's side right for every locale — but its choice
 * of symbol is CLDR's, and CLDR disambiguates: an Arabic or French visitor is
 * shown `US$` / `$US` for dollars and `UK£` / `£GB` for pounds, and a Turkish
 * riyal comes out as the bare code. On a donation button that reads as a
 * warning rather than a price. `currencyDisplay: "narrowSymbol"` helps in some
 * locales and not in Arabic, where the narrow symbol for USD is still `US$`.
 *
 * So the number is formatted by ICU and only the symbol is swapped: the
 * `currency` part of `formatToParts` is replaced with the symbol from
 * `lib/supported-currencies.ts` — the same table the currency selector shows —
 * and ICU's narrow symbol is the fallback for anything not in that table. The
 * placement, spacing and digits stay exactly as ICU laid them out for the
 * locale.
 */

const SYMBOLS: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCY_OPTIONS.map((c) => [c.code, c.symbol])
);

/** The short symbol for a code — `$`, `€`, `₺`, `ر.س` — or the code itself. */
export function currencySymbol(code: string): string {
  return SYMBOLS[code.toUpperCase()] ?? code;
}

export function formatMoney(
  value: number,
  currency: string,
  locale: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const code = currency.toUpperCase();
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
      ...options,
    });
    const own = SYMBOLS[code];
    return formatter
      .formatToParts(value)
      .map((part) => (part.type === "currency" && own ? own : part.value))
      .join("");
  } catch {
    // An unknown currency code or an ICU gap must not take the page down.
    return `${currencySymbol(code)} ${Math.round(value).toLocaleString(locale)}`;
  }
}
