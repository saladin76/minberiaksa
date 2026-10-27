import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Both the scheduler and repricing use this gate, including legacy Mongo rows. */
export function billingLeaseAvailable(now: Date): Prisma.SubscriptionWhereInput {
  return { OR: [{ billingLeaseUntil: null }, { billingLeaseUntil: { isSet: false } }, { billingLeaseUntil: { lte: now } }] };
}

type Plan = { id: string; provider: string | null; amount: number; chargeAttempts: number; nextBillingDate: Date | null; paymentCardId?: string | null; paypalVaultId?: string | null };
/** Atomic claim before any ledger row/provider call. Expiry recovers a crashed worker;
 * the existing per-cycle order ID/ledger guard still prevents replay after a call. */
export async function withRecurringLease<T>(db: Pick<PrismaClient, "subscription">, plan: Plan, now: Date, charge: () => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const claimed = await db.subscription.updateMany({
    where: {
      id: plan.id, status: "ACTIVE", provider: plan.provider, amount: plan.amount,
      chargeAttempts: plan.chargeAttempts, nextBillingDate: plan.nextBillingDate,
      ...(plan.provider === "ALBARAKA" ? { paymentCardId: plan.paymentCardId } : { paypalVaultId: plan.paypalVaultId }),
      AND: [billingLeaseAvailable(now), { OR: [{ amountChangeLock: null }, { amountChangeLock: { isSet: false } }] }],
    },
    data: { billingLeaseToken: token, billingLeaseUntil: new Date(now.getTime() + 15 * 60 * 1000) },
  });
  if (claimed.count !== 1) return null;
  try { return await charge(); }
  finally {
    await db.subscription.updateMany({ where: { id: plan.id, billingLeaseToken: token }, data: { billingLeaseToken: null, billingLeaseUntil: null } });
  }
}
