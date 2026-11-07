import type { PrismaClient } from "@prisma/client";
import { bankBalance, type BankDonation } from "../donations/bank-operations-core";
import { bankDonationSelect } from "../donations/bank-operations-service";

export type DonationFinancialSummary = {
  state: "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOIDED" | "REVIEW_REQUIRED";
  returnedMinor: number | null;
  remainingMinor: number | null;
  currency: string | null;
};

/** Only this small DTO may leave the server; never serialize the private ledger. */
export function donationFinancialSummary(donation: BankDonation): DonationFinancialSummary | null {
  if (!donation.paidAt || donation.status !== "PAID" || !["ALBARAKA", "PAYFOR"].includes(donation.provider || "")) return null;
  try {
    const balance = bankBalance(donation);
    return {
      state: balance.blocked ? "REVIEW_REQUIRED" : balance.voided ? "VOIDED" : balance.remainingMinor === 0 ? "REFUNDED" : balance.returnedMinor > 0 ? "PARTIALLY_REFUNDED" : "PAID",
      returnedMinor: balance.returnedMinor,
      remainingMinor: balance.remainingMinor,
      currency: balance.sale.currency,
    };
  } catch {
    return donation.bankOperations || donation.bankOperationLock || donation.bankLastInquiry
      ? { state: "REVIEW_REQUIRED", returnedMinor: null, remainingMinor: null, currency: null }
      : null;
  }
}

/** IDs must come from the caller's already authorized donation listing. */
export async function loadDonationFinancialSummaries(database: Pick<PrismaClient, "donation">, authorizedIds: string[]) {
  if (!authorizedIds.length) return new Map<string, DonationFinancialSummary | null>();
  const rows = await database.donation.findMany({ where: { id: { in: authorizedIds }, provider: { in: ["ALBARAKA", "PAYFOR"] } }, select: bankDonationSelect });
  return new Map(rows.map(row => [row.id, donationFinancialSummary(row)]));
}
