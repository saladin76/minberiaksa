import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A recovery changes ONLY the dashboard presentation of a FAILED attempt.
 * It never changes its payment status, donor ownership, gateway ledger or
 * accounting/attribution records.
 *
 * A matching settled checkout must be a NEW, one-time card donation from the
 * same donor and gateway, with an identical allocation and amount, created
 * within 30 minutes after the failed attempt. This is deliberately strict:
 * two different projects or subscription instalments must never collapse.
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
      ["campaign", item.campaignId, toMinor(item.amount), item.shareCount ?? null,
        item.giftRecipientName ?? "", item.giftRecipientEmail ?? "",
        item.giftRecipientPhone ?? "", item.giftMessage ?? ""].join(":")),
    ...row.categoryItems.map((item) =>
      ["category", item.categoryId, toMinor(item.amount)].join(":")),
    ...row.waqfItems.map((item) =>
      ["waqf", item.unit, item.count, toMinor(item.amount), item.donorName, item.onBehalf].join(":")),
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
 * Idempotent, display-only write AFTER a provider-verified settlement.
 * Fails closed if another same-intent settled donation makes the relationship
 * ambiguous. A dashboard operator can always inspect raw FAILED attempts.
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
    allocationSignature(settled) === null
  ) return { recoveredIds: [] };

  const from = new Date(settled.createdAt.getTime() - DONATION_RECOVERY_WINDOW_MS);
  const nearbySettled = await prisma.donation.findMany({
    where: {
      donorId: settled.donorId,
      status: "PAID",
      paidAt: { not: null },
      paymentMethod: "CARD",
      provider: settled.provider,
      currency: settled.currency,
      createdAt: { gte: from, lte: settled.createdAt },
    },
    select: recoverySelect,
    take: 41,
  });
  // Do not guess which checkout superseded a failure when the donor made
  // another genuinely settled matching donation or the result is truncated.
  if (
    nearbySettled.length > 40 ||
    nearbySettled.some((row) =>
      row.id !== settled.id &&
      row.status === "PAID" &&
      row.paidAt !== null &&
      row.subscriptionId === null &&
      row.donorId === settled.donorId &&
      row.currency === settled.currency &&
      row.provider === settled.provider &&
      toMinor(row.totalAmount) === toMinor(settled.totalAmount) &&
      allocationSignature(row) === allocationSignature(settled))
  ) return { recoveredIds: [] };

  const failed = await prisma.donation.findMany({
    where: {
      donorId: settled.donorId,
      status: "FAILED",
      paymentMethod: "CARD",
      provider: settled.provider,
      currency: settled.currency,
      createdAt: { gte: from, lte: settled.createdAt },
      OR: [
        { overviewRecoveredByDonationId: null },
        { overviewRecoveredByDonationId: { isSet: false } },
      ],
    },
    select: recoverySelect,
    take: 41,
  });
  if (failed.length > 40) return { recoveredIds: [] };
  const recoveredIds = failed.filter((row) => isRecoveredFailedAttempt(row, settled)).map((row) => row.id);
  if (!recoveredIds.length || options.dryRun) return { recoveredIds };

  await prisma.donation.updateMany({
    where: {
      id: { in: recoveredIds },
      donorId: settled.donorId,
      status: "FAILED",
      OR: [
        { overviewRecoveredByDonationId: null },
        { overviewRecoveredByDonationId: { isSet: false } },
      ],
    },
    data: { overviewRecoveredByDonationId: settled.id },
  });
  return { recoveredIds };
}
