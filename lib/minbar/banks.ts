/**
 * Bank accounts for the bank-transfer donation path.
 *
 * Shape follows `Minbar/الحسابات البنكية.dc.html`: a bank can hold several
 * currencies, each with its own account number and IBAN, and several banks can
 * be published at once.
 *
 * SOURCE OF THE VALUES: these are the association's real, published accounts,
 * carried over verbatim from `app/[locale]/bank-transfer/_components/
 * BankAccountsBlock.tsx`. The handoff's own page ships placeholders ("—") with
 * `common.toBeVerified` "حتى تصل البيانات الرسمية" — until the official details
 * arrive. Shipping those placeholders as live payment details would send donors'
 * transfers nowhere, so the real accounts are used and the handoff's *design* is
 * what was ported, not its sample data.
 *
 * `[DASHBOARD-INTEGRATION]`: the handoff specifies accounts per language /
 * region managed from the dashboard, because a Turkish donor and a Gulf donor
 * should not be given the same IBAN. `banksFor(locale)` is the seam for that —
 * it returns the same list for every locale today and becomes a query once the
 * `BankAccount` model exists.
 *
 * Numeric identifiers (IBAN, SWIFT, account number) are never translated and
 * are always rendered `dir="ltr"` with `unicode-bidi: isolate`; they are also
 * the one place the design permits `word-break: break-all`.
 */

export interface BankCurrencyAccount {
  /** ISO code, or the local label the bank itself uses (e.g. "TL"). */
  code: string;
  iban: string;
  accountNo?: string;
  /** Extension / sub-account number where the bank issues one. */
  extNo?: string;
}

export interface MinbarBank {
  id: string;
  name: string;
  /** Legal account holder. Not translated — it is a registered name. */
  holder: string;
  swift: string;
  branch?: string;
  /** Path under /public, when a logo is available. */
  logo?: string;
  currencies: BankCurrencyAccount[];
}

const ACCOUNT_HOLDER = "Minberiaksa Uluslararası Yardımlaşma Derneği";

const BANKS: readonly MinbarBank[] = [
  {
    id: "ziraat-katilim",
    name: "Ziraat Katılım Bankası",
    holder: ACCOUNT_HOLDER,
    swift: "ZKBATRIS",
    logo: "/ziraat-katilim.jpg",
    currencies: [
      { code: "TL", iban: "TR750020900001843729000001" },
      { code: "EUR", iban: "TR210020900001843729000003" },
      { code: "USD", iban: "TR480020900001843729000002" },
    ],
  },
  {
    id: "albaraka",
    name: "AlbarakaTürk Katılım Bankası",
    holder: ACCOUNT_HOLDER,
    swift: "BTFHTRIS",
    currencies: [{ code: "TL", iban: "TR710020300009942518000001" }],
  },
];

/** Published banks for a locale. One list today; per-region once in the CMS. */
export function banksFor(_locale: string): readonly MinbarBank[] {
  return BANKS;
}

/** Group an IBAN into fours so it can be read and checked against a statement. */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
