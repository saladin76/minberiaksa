type Payment = { id: string; subscriptionId: string | null; status: string; paidAt: Date | null; createdAt: Date; billingReason: string | null; providerTxnType: string | null };
export type SubscriptionPaymentSequence = { subscriptionCycle: number; renewalNumber: number | null; testCycle: number | null; isRecurringCharge: boolean };

/** Failed attempts and accelerated tests must not advance real renewal counts. */
export function subscriptionPaymentSequence(rows: readonly Payment[]) {
  const results = new Map<string, SubscriptionPaymentSequence>();
  const totals = new Map<string, { settled: number; tests: number }>();
  for (const row of [...rows].sort((a,b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    if (!row.subscriptionId) continue;
    const count = totals.get(row.subscriptionId) ?? { settled: 0, tests: 0 };
    const test = row.billingReason === "subscription_test_cycle";
    const renewal = !test && row.billingReason !== "subscription_create" && (row.billingReason === "subscription_cycle" || row.providerTxnType === "RecurringSale" || count.settled > 0);
    const renewalNumber = renewal ? Math.max(1, count.settled) : null;
    results.set(row.id, { subscriptionCycle: renewalNumber ? renewalNumber + 1 : 1, renewalNumber, testCycle: test ? ++count.tests : null, isRecurringCharge: test || renewal });
    if (!test && row.status === "PAID" && row.paidAt) count.settled++;
    totals.set(row.subscriptionId, count);
  }
  return results;
}
