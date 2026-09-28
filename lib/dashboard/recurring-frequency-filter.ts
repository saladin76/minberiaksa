import type { Prisma, PrismaClient } from "@prisma/client";
import {
  RECURRING_FREQUENCIES,
  chargesPerMonth,
  isRecurringFrequency,
  type RecurringFrequency,
} from "@/lib/donations/recurring-schedule";

/**
 * The cadence filter shared by every /dashboard/monthly (التبرعات المتكررة) API.
 *
 * One rule matters here: plans written before `Subscription.frequency` existed
 * have no field at all in MongoDB, and they are monthly (the only cadence that
 * was ever billed then). A plain `{ frequency: "MONTHLY" }` would silently drop
 * them. So MONTHLY is expressed as "not DAILY and not FRIDAY", which an absent
 * field satisfies, and the lookups below only ever read `frequency` on rows
 * that are known to carry DAILY or FRIDAY  never on a row that might lack it.
 */

export type FrequencyFilter = RecurringFrequency | null;

/** `?frequency=DAILY|FRIDAY|MONTHLY` → that cadence; anything else (incl. `all`) → null. */
export function parseFrequencyParam(value: string | null | undefined): FrequencyFilter {
  const v = value?.trim().toUpperCase();
  return isRecurringFrequency(v) ? v : null;
}

const NON_MONTHLY: RecurringFrequency[] = ["DAILY", "FRIDAY"];

/** Plans of one cadence, legacy (field-less) plans counted as MONTHLY. */
export function subscriptionFrequencyWhere(frequency: RecurringFrequency): Prisma.SubscriptionWhereInput {
  if (frequency === "MONTHLY") {
    return { NOT: NON_MONTHLY.map((f) => ({ frequency: f })) };
  }
  return { frequency };
}

/**
 * Donations charged against a plan of one cadence. Returns null for "all", so
 * callers can compose with `donationWhereAll` without a special case.
 */
export function donationFrequencyWhere(frequency: FrequencyFilter): Prisma.DonationWhereInput | null {
  if (!frequency) return null;
  return { subscription: { is: subscriptionFrequencyWhere(frequency) } };
}

/**
 * Cadence of each given plan. Only DAILY/FRIDAY rows are fetched (by an
 * equality match, so `frequency` is always present on what is read); every
 * other id  monthly or legacy  resolves to MONTHLY.
 */
export async function loadSubscriptionFrequencies(
  prisma: PrismaClient,
  subscriptionIds?: readonly string[]
): Promise<(subscriptionId: string | null | undefined) => RecurringFrequency> {
  const byId = new Map<string, RecurringFrequency>();
  if (!subscriptionIds || subscriptionIds.length > 0) {
    const rows = await prisma.subscription.findMany({
      where: {
        frequency: { in: NON_MONTHLY },
        ...(subscriptionIds ? { id: { in: [...new Set(subscriptionIds)] } } : {}),
      },
      select: { id: true, frequency: true },
    });
    for (const r of rows) byId.set(r.id, r.frequency);
  }
  return (id) => (id ? byId.get(id) ?? "MONTHLY" : "MONTHLY");
}

/** Per-cadence totals, in the fixed DAILY → FRIDAY → MONTHLY order. */
export type FrequencyRecord<T> = Record<RecurringFrequency, T>;

export function emptyFrequencyRecord<T>(make: () => T): FrequencyRecord<T> {
  return Object.fromEntries(RECURRING_FREQUENCIES.map((f) => [f, make()])) as FrequencyRecord<T>;
}

/** Per-charge amount → the same plan's average monthly amount. */
export function monthlyEquivalent(amountPerCharge: number, frequency: RecurringFrequency): number {
  return amountPerCharge * chargesPerMonth(frequency);
}

export { RECURRING_FREQUENCIES };
