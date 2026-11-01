/** A paid signup is never evidence that a later automatic instalment succeeded. */
export type RenewalRow = { provider: string | null; billingReason: string | null; providerTxnType: string | null; subscriptionId: string | null; paidAt: Date | null; status: string; providerTxnResult: string | null; providerProcReturnCode: string | null; createdAt: Date };
export type RenewalEvidence = { since: string; complete: boolean; groups: { provider: string; frequency: string; confirmed: number; declined: number; notCollected: number; unresolved: number; latestConfirmedAt: string | null; lastDeclineCode: string | null }[] };
export function renewalEvidence(rows: RenewalRow[], frequencyOf: (id: string | null) => string, since: Date, complete: boolean): RenewalEvidence {
  const groups = new Map<string, RenewalEvidence["groups"][number]>();
  for (const row of rows) {
    if (row.billingReason === "subscription_test_cycle") continue;
    if (!row.subscriptionId || row.createdAt < since || !(row.billingReason === "subscription_cycle" || row.providerTxnType === "RecurringSale")) continue;
    const provider = row.provider || "UNKNOWN", frequency = frequencyOf(row.subscriptionId), key = `${provider}/${frequency}`;
    const group = groups.get(key) || { provider, frequency, confirmed: 0, declined: 0, notCollected: 0, unresolved: 0, latestConfirmedAt: null, lastDeclineCode: null };
    groups.set(key, group);
    if (row.paidAt && row.status === "PAID") { group.confirmed++; if (!group.latestConfirmedAt || row.paidAt.toISOString() > group.latestConfirmedAt) group.latestConfirmedAt = row.paidAt.toISOString(); }
    else if (row.status === "FAILED" && row.providerTxnResult === "Failed" && row.providerProcReturnCode && !["00", "0000"].includes(row.providerProcReturnCode)) { group.declined++; if (!group.lastDeclineCode && /^[0-9A-Z]{2,4}$/.test(row.providerProcReturnCode || "")) group.lastDeclineCode = row.providerProcReturnCode; }
    else if (row.status === "FAILED" && row.providerTxnResult === "Failed") group.notCollected++;
    else group.unresolved++;
  }
  return { since: since.toISOString(), complete, groups: [...groups.values()] };
}
