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
 */

import { listBankAccounts } from "@/lib/minbar/cms";

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

/** The accounts published to this locale, in the order the dashboard set. */
export async function banksFor(locale: string): Promise<readonly MinbarBank[]> {
  const rows = await listBankAccounts(locale);
  return rows.map((b) => ({
    id: b.slug,
    name: b.name,
    holder: b.holder,
    swift: b.swift,
    branch: b.branch || undefined,
    logo: b.logo || undefined,
    /* A currency row with no IBAN is not something a donor can transfer to;
       the dashboard refuses to save one, but read defensively. */
    currencies: b.currencies
      .filter((c) => c.iban)
      .map((c) => ({ code: c.code, iban: c.iban, accountNo: c.accountNo || undefined, extNo: c.extNo || undefined })),
  }));
}

export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
