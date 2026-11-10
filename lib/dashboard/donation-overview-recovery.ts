import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A recovery changes ONLY the dashboard presentation of a FAILED attempt.
 * It never changes its payment status, donor ownership, gateway ledger or
 * accounting/attribution records.
 *
 * A matching settled checkout must be a NEW, one-time card donation from the
 * same donor and gateway, with the SAME non-empty provider order reference,
 * plus identical allocation and amount, created within 30 minutes. Similar
 * amount/time/project is NOT proof of the same checkout: separate donations
 * must remain visible until a provider-confirmed identity links them.
 */
export const DONATION_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

const recoverySelect = {
  id: true,
  donorId: true,
  status: true,
  paidAt: true,
  createdAt: true,
  subscriptionId: true,
  paymentMethod: true,
  provider: true,
  providerOrderId: true,
  amount: true,
  totalAmount: true,
  currency: true,
  teamSupport: true,
  fees: true,
  coverFees: true,
  items: {
    select: {
      campaignId: true,
      amount: true,
      shareCount: true,
      giftRecipientName: true,
      giftRecipientEmail: true,
      giftRecipientPhone: true,
      giftMessage: true,
      giftChannels: true,
      giftShowAmount: true,
    },
  },
  categoryItems: { select: { categoryId: true, amount: true } },
  waqfItems: {
    select: { unit: true, count: true, amount: true, donorName: true, onBehalf: true },
  },
} as const satisfies Prisma.DonationSelect;

export type RecoveryDonation = Prisma.DonationGetPayload<{ select: typeof recoverySelect }>;

const toMinor = (amount: number) =>
  Number.isFinite(amount) ? Math.round(amount * 100) : null;

function allocationSignature(row: RecoveryDonation): string | null {
  const lines = [
    ...row.items.map((item) =>
      JSON.stringify(["campaign", item.campaignId, toMinor(item.amount), item.shareCount ?? null,
        item.giftRecipientName ?? "", item.giftRecipientEmail ?? "",
        item.giftRecipientPhone ?? "", item.giftMessage ?? "",
        [...(item.giftChannels ?? [])].sort(), item.giftShowAmount !== false])),
    ...row.categoryItems.map((item) =>
      JSON.stringify(["category", item.categoryId, toMinor(item.amount)])),
    ...row.waqfItems.map((item) =>
      JSON.stringify(["waqf", item.unit, item.count, toMinor(item.amount), item.donorName, item.onBehalf])),
  ];
  if (lines.length === 0) return null;
  return JSON.stringify(lines.sort());
}

export function isRecoveredFailedAttempt(
  failed: RecoveryDonation,
  settled: RecoveryDonation,
): boolean {
  if (
    failed.id === settled.id ||
    failed.status !== "FAILED" ||
    failed.paidAt !== null ||
    settled.status !== "PAID" ||
    settled.paidAt === null ||
    failed.donorId !== settled.donorId ||
    failed.subscriptionId !== null ||
    settled.subscriptionId !== null ||
    failed.paymentMethod !== "CARD" ||
    settled.paymentMethod !== "CARD" ||
    !failed.provider ||
    failed.provider !== settled.provider ||
    !failed.providerOrderId ||
    !settled.providerOrderId ||
    failed.providerOrderId !== settled.providerOrderId ||
    failed.currency !== settled.currency ||
    failed.coverFees !== settled.coverFees
  ) return false;
  for (const field of ["amount", "totalAmount", "teamSupport", "fees"] as const) {
    const first = toMinor(failed[field]);
    const second = toMinor(settled[field]);
    if (first === null || second === null || first !== second) return false;
  }
  const delta = settled.createdAt.getTime() - failed.createdAt.getTime();
  if (
    !Number.isFinite(delta) ||
    delta < 0 ||
    delta > DONATION_RECOVERY_WINDOW_MS ||
    settled.paidAt.getTime() < failed.createdAt.getTime()
  ) return false;
  const fingerprint = allocationSignature(failed);
  return fingerprint !== null && fingerprint === allocationSignature(settled);
}

/**
 * Never infer a recovery if the bank-order reference belongs to multiple
 * failed rows, even when their contents differ. Split/mixed-cart records can
 * legitimately share a payment reference without representing retries.
 */
export function uniqueRecoveredFailedAttemptIds(
  candidates: RecoveryDonation[], settled: RecoveryDonation,
): string[] {
  return candidates.length === 1 && isRecoveredFailedAttempt(candidates[0], settled)
    ? [candidates[0].id]
    : [];
}

/**
 * Idempotent, display-only write AFTER a provider-verified settlement.
 * Fails closed if any other successful or failed row uses the same order
 * reference. A dashboard operator can always inspect raw FAILED attempts.
 */
export async function linkRecoveredFailedAttempts(
  paidDonationId: string,
  options: { dryRun?: boolean } = {},
): Promise<{ recoveredIds: string[] }> {
  const settled = await prisma.donation.findUnique({
    where: { id: paidDonationId },
    select: recoverySelect,
  });
  if (
    !settled ||
    settled.status !== "PAID" ||
    settled.paidAt === null ||
    settled.subscriptionId !== null ||
    settled.paymentMethod !== "CARD" ||
    !settled.provider ||
    !settled.providerOrderId ||
    allocationSignature(settled) === null
  ) return { recoveredIds: [] };

  const from = new Date(settled.createdAt.getTime() - DONATION_RECOVERY_WINDOW_MS);
  // An order reused for another successful donation cannot safely identify
  // which failed record it recovered. Query all dates/amounts and stop at two.
  const settledWithOrder = await prisma.donation.findMany({
    where: {
      donorId: settled.donorId,
      status: "PAID",
      provider: settled.provider,
      providerOrderId: settled.providerOrderId,
    },
    select: { id: true },
    take: 2,
  });
  if (settledWithOrder.length !== 1 || settledWithOrder[0].id !== settled.id) {
    return { recoveredIds: [] };
  }

  const failed = await prisma.donation.findMany({
    where: {
      donorId: settled.donorId,
      status: "FAILED",
      paymentMethod: "CARD",
      providerOrderId: settled.providerOrderId,
      provider: settled.provider,
      currency: settled.currency,
      createdAt: { gte: from, lte: settled.createdAt },
      OR: [
        { overviewRecoveredByDonationId: null },
        { overviewRecoveredByDonationId: { isSet: false } },
      ],
    },
    select: recoverySelect,
    // A second failed row sharing the bank reference makes any link ambiguous.
    take: 2,
  });
  const recoveredIds = uniqueRecoveredFailedAttemptIds(failed, settled);
  if (!recoveredIds.length || options.dryRun) return { recoveredIds };

  const update = await prisma.donation.updateMany({
    where: {
      id: { in: recoveredIds },
      donorId: settled.donorId,
      providerOrderId: settled.providerOrderId,
      status: "FAILED",
      OR: [
        { overviewRecoveredByDonationId: null },
        { overviewRecoveredByDonationId: { isSet: false } },
      ],
    },
    data: { overviewRecoveredByDonationId: settled.id },
  });
  return { recoveredIds: update.count === 1 ? recoveredIds : [] };
}
