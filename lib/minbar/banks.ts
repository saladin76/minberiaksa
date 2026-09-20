/**
 * Bank accounts for the bank-transfer donation path.
 *
 * These used to be a hand-written list in this file. They are now rows of the
 * BankAccount model, entered and maintained from the dashboard, and this module
 * is the seam the bank-transfer page and the checkout read them through — the
 * shape they render is unchanged, so neither had to be touched.
 *
 * `locales` on a row is an allow-list: an account published only to the
 * Turkish edition is not handed to a Gulf donor. Empty means every edition.
 *
 * `banksFor` — the database read — lives in `banks-server.ts`: this file is
 * imported by client components for the type and `formatIban`, and the CMS
 * reader pulls `server-only` in behind it, which a client bundle rejects.
 */

export interface BankCurrencyAccount {
  /** ISO 4217 code. */
  code: string;
  iban: string;
  accountNo?: string;
  /** Extension / sub-account number where the bank issues one. */
  extNo?: string;
}

export interface MinbarBank {
  id: string;
  name: string;
  /** Legal account holder. */
  holder: string;
  swift: string;
  branch?: string;
  /** Logo URL, when one is available. */
  logo?: string;
  currencies: BankCurrencyAccount[];
}

export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
