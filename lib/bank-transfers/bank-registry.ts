/** Statement-import bank labels are not published donor payment destinations. */
export const TRANSFER_BANK_COLLECTION = "BankTransferBank";

/** Compatibility read for labels incorrectly inserted by the old GET handler.
 * Their IDs remain usable by historical statement rows; no financial data is moved. */
export const LEGACY_TRANSFER_BANK_FILTER = {
  name: { $exists: false }, slug: { $exists: false }, holder: { $exists: false },
  code: { $type: "string" }, nameAr: { $type: "string" },
};

export function isLegacyTransferBank(row: Record<string, unknown>): boolean {
  return !("name" in row) && !("slug" in row) && !("holder" in row)
    && typeof row.code === "string" && typeof row.nameAr === "string";
}

/** Missing canonical fields must never reach the public donation destinations. */
export const PUBLISHED_BANK_ACCOUNT_FIELDS = {
  name: { gt: "" }, slug: { gt: "" }, holder: { gt: "" },
} as const;
