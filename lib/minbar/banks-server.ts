import "server-only";

import { listBankAccounts } from "@/lib/minbar/cms";
import type { MinbarBank } from "./banks";

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

