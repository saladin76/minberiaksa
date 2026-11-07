import type { Prisma } from "@prisma/client";
import { subscriptionFrequencyWhere } from "../dashboard/recurring-frequency-filter";
import { isRecurringFrequency, type RecurringFrequency } from "../donations/recurring-schedule";

export type RecurringAudienceFilters = { recurringOnly?: boolean; oneTimeOnly?: boolean; recurringFrequencies?: string[]; excludeRecurringFrequencies?: string[] };
export const cleanAudienceFrequencies = (values: unknown): RecurringFrequency[] => Array.isArray(values) ? [...new Set(values.filter(isRecurringFrequency))] : [];
export function recurringAudienceWhere(filters: RecurringAudienceFilters): Prisma.UserWhereInput[] {
  const clauses: Prisma.UserWhereInput[] = [];
  const confirmed: Prisma.SubscriptionWhereInput = { donations: { some: { status: "PAID", paidAt: { not: null } } } };
  const matching = (frequencies: string[]): Prisma.SubscriptionWhereInput => ({ status: "ACTIVE", AND: [confirmed, { OR: cleanAudienceFrequencies(frequencies).map(subscriptionFrequencyWhere) }] });
  if (filters.oneTimeOnly) clauses.push({ subscriptions: { none: confirmed }, donations: { some: { status: "PAID", paidAt: { not: null }, OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] } } });
  if (filters.recurringFrequencies?.length) clauses.push({ subscriptions: { some: matching(filters.recurringFrequencies) } });
  else if (filters.recurringOnly) clauses.push({ subscriptions: { some: { status: "ACTIVE", ...confirmed } } });
  if (filters.excludeRecurringFrequencies?.length) clauses.push({ subscriptions: { none: matching(filters.excludeRecurringFrequencies) } });
  return clauses;
}
