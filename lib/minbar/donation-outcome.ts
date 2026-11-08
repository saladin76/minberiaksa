/**
 * A success page is proof of a confirmed charge, never just a PAID placeholder.
 * Checkout creates PAID rows before provider settlement; paidAt is the authoritative gate.
 * This module is pure so the route and regressions share the same rule.
 */
export const CONFIRMED_MINBAR_DONATION_WHERE = {
  status: "PAID",
  paidAt: { not: null },
} as const;

export type DonationPageOutcome = "CONFIRMED" | "FAILED" | "PENDING_PAYMENT" | "PENDING_TRANSFER" | "INCONSISTENT" | "NOT_FOUND";

export function donationPageOutcome(
  row: { status: string; paidAt: Date | null; provider: string | null } | null,
): DonationPageOutcome {
  if (!row) return "NOT_FOUND";
  if (row.status === "PAID" && row.paidAt != null) return "CONFIRMED";
  // A legacy contradictory record must not invite another charge or claim a failure.
  if (row.paidAt != null) return "INCONSISTENT";
  if (row.status === "FAILED") return "FAILED";
  if (row.status === "PAID") {
    return row.provider === "BANK_TRANSFER" ? "PENDING_TRANSFER" : "PENDING_PAYMENT";
  }
  return "INCONSISTENT";
}
