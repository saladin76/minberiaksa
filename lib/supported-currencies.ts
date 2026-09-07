/**
 * Canonical list of display / donation currencies (same set as the public currency selector,
 * excluding the pseudo "DEFAULT" option which only applies to cookie UX).
 */
export type SupportedCurrencyOption = {
  code: string;
  symbol: string;
  name: string;
};

export const SUPPORTED_CURRENCY_OPTIONS = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "KWD", symbol: "د.ك", name: "Kuwaiti Dinar" },
  { code: "QAR", symbol: "﷼", name: "Qatari Riyal" },
  { code: "BHD", symbol: "ب.د", name: "Bahraini Dinar" },
  { code: "OMR", symbol: "ر.ع.‏", name: "Omani Rial" },
  { code: "JOD", symbol: "د.أ", name: "Jordanian Dinar" },
  { code: "MAD", symbol: "د.م.", name: "Moroccan Dirham" },
] as const satisfies readonly SupportedCurrencyOption[];

/** For admin selects (campaign suggested amounts / share prices, etc.) */
export const SUPPORTED_CURRENCY_CODES: readonly string[] = SUPPORTED_CURRENCY_OPTIONS.map(
  (o) => o.code
);
