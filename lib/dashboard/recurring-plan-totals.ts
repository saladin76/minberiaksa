import type { Prisma, PrismaClient } from "@prisma/client";
import { emptyFrequencyRecord, monthlyEquivalent, RECURRING_FREQUENCIES, subscriptionFrequencyWhere } from "./recurring-frequency-filter";

type CadenceTotal = { count: number; amountUSD: number; monthlyUSD: number };
/** Read-only reporting: per-charge amounts cannot be added across different cadences.
 * Equality-filtered aggregates also keep legacy records without frequency in MONTHLY.
 */
export async function recurringPlanTotals(db: Pick<PrismaClient, "subscription">, where: Prisma.SubscriptionWhereInput) {
  const results = await Promise.all(RECURRING_FREQUENCIES.map(frequency => db.subscription.aggregate({
    where: { AND: [where, subscriptionFrequencyWhere(frequency)] },
    _sum: { amountUSD: true }, _count: { id: true },
  })));
  const byFrequency = emptyFrequencyRecord<CadenceTotal>(() => ({ count: 0, amountUSD: 0, monthlyUSD: 0 }));
  const total: CadenceTotal = { count: 0, amountUSD: 0, monthlyUSD: 0 };
  RECURRING_FREQUENCIES.forEach((frequency, index) => {
    const amountUSD = results[index]._sum?.amountUSD ?? 0;
    const row = { count: results[index]._count?.id ?? 0, amountUSD, monthlyUSD: monthlyEquivalent(amountUSD, frequency) };
    byFrequency[frequency] = row;
    total.count += row.count; total.amountUSD += row.amountUSD; total.monthlyUSD += row.monthlyUSD;
  });
  return { total, byFrequency };
}
