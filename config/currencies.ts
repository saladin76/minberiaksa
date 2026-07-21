export type CurrencyOption = {
  code: string;
  symbol: string;
  label: string;
  decimalDigits: number;
  enabled: boolean;
};

export const currencies: CurrencyOption[] = [
  { code: "USD", symbol: "$", label: "US Dollar", decimalDigits: 2, enabled: true },
  { code: "EUR", symbol: "€", label: "Euro", decimalDigits: 2, enabled: true },
  { code: "GBP", symbol: "£", label: "British Pound", decimalDigits: 2, enabled: true },
  { code: "TRY", symbol: "₺", label: "Turkish Lira", decimalDigits: 2, enabled: true },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal", decimalDigits: 2, enabled: true },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham", decimalDigits: 2, enabled: true },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar", decimalDigits: 2, enabled: true },
  { code: "AUD", symbol: "A$", label: "Australian Dollar", decimalDigits: 2, enabled: true },
  { code: "KWD", symbol: "د.ك", label: "Kuwaiti Dinar", decimalDigits: 3, enabled: true },
  { code: "QAR", symbol: "﷼", label: "Qatari Riyal", decimalDigits: 2, enabled: true },
  { code: "BHD", symbol: "د.ب", label: "Bahraini Dinar", decimalDigits: 3, enabled: true },
  { code: "OMR", symbol: "﷼", label: "Omani Rial", decimalDigits: 3, enabled: true },
  { code: "JOD", symbol: "د.ا", label: "Jordanian Dinar", decimalDigits: 3, enabled: true },
  { code: "MAD", symbol: "د.م.", label: "Moroccan Dirham", decimalDigits: 2, enabled: true },
];
