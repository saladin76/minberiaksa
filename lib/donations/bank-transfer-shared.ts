import type { BankTransferClaimStatus } from "@prisma/client";
import { formatMoney } from "@/lib/minbar/money";
import { miaPath } from "@/lib/minbar/routes";

/**
 * The parts of the bank-transfer receipt flow that both the server service and
 * the browser need: the constants, the status vocabulary and the URL of the
 * donor's status page. No Prisma client, no `server-only`.
 */

export const BANK_TRANSFER_PROVIDER = "BANK_TRANSFER";

/** First upload plus the two re-uploads `DONATION_LOGIC_SPEC §3` allows after a rejection. */
export const BANK_TRANSFER_MAX_SUBMISSIONS = 3;

/** Marker in `providerErrorMessage` for a rejected transfer, beside the reason. */
export const BANK_TRANSFER_REJECTED_MARKER = "BANK_TRANSFER_REJECTED";

/** The order the dashboard works the queue in: what needs a decision first. */
export const CLAIM_STATUS_ORDER: BankTransferClaimStatus[] = ["UNDER_REVIEW", "AWAITING_RECEIPT", "REJECTED", "CONFIRMED"];

export function safeMoney(amount: number, currency: string, locale: string): string {
  try {
    return formatMoney(amount, currency, locale);
  } catch {
    return `${Math.round(amount * 100) / 100} ${currency}`;
  }
}

/** The donor-facing status page for a claim; guests get the token appended. */
export function claimStatusPath(claim: { donationId: string; accessToken: string }, locale: string, withToken: boolean): string {
  const base = miaPath("paymentPending", locale, claim.donationId);
  return withToken ? `${base}?t=${claim.accessToken}` : base;
}

/** Whether the donor can (still) upload a receipt in the claim's current state. */
export function claimAcceptsReceipt(claim: { status: BankTransferClaimStatus; submissionCount: number }): boolean {
  if (claim.status === "CONFIRMED" || claim.status === "UNDER_REVIEW") return false;
  return claim.submissionCount < BANK_TRANSFER_MAX_SUBMISSIONS;
}
