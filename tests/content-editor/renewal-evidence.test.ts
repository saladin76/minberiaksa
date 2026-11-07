import test from "node:test";
import assert from "node:assert/strict";
import { renewalEvidence, type RenewalRow } from "../../lib/donations/renewal-evidence";
const since = new Date("2026-10-01T00:00:00Z");
const row = (changes: Partial<RenewalRow> = {}): RenewalRow => ({ provider: "ALBARAKA", billingReason: "subscription_cycle", providerTxnType: "RecurringSale", subscriptionId: "test-plan", paidAt: null, status: "FAILED", providerTxnResult: "Failed", providerProcReturnCode: "05", createdAt: new Date("2026-10-10T00:00:00Z"), ...changes });
test("accelerated rehearsal payments are separately labelled and cannot establish ordinary production renewal evidence", () => {
  const result = renewalEvidence([row({ billingReason: "subscription_test_cycle", paidAt: new Date(), status: "PAID" })], () => "MONTHLY", since, true);
  assert.equal(result.groups.length, 0);
});
test("a paid signup never establishes successful automatic renewal", () => { const result = renewalEvidence([row({ billingReason: "subscription_create", providerTxnType: "Sale", paidAt: new Date(), status: "PAID" })], () => "MONTHLY", since, true); assert.equal(result.groups.length, 0); });
test("only settled renewals count as confirmed; unknown responses remain unresolved", () => {
  const result = renewalEvidence([row({ paidAt: new Date("2026-10-11"), status: "PAID" }), row(), row({ providerTxnResult: "Unknown" }), row({ status: "PAID", providerTxnResult: "Processing" })], () => "MONTHLY", since, true);
  assert.deepEqual(result.groups[0], { provider: "ALBARAKA", frequency: "MONTHLY", confirmed: 1, declined: 1, notCollected: 0, unresolved: 2, latestConfirmedAt: "2026-10-11T00:00:00.000Z", lastDeclineCode: "05" });
});
test("renewal evidence keeps monthly separate from daily and discloses truncation", () => { const result = renewalEvidence([row(), row({ subscriptionId: "daily" }), row({ createdAt: new Date("2026-09-01") })], id => id === "daily" ? "DAILY" : "MONTHLY", since, false); assert.equal(result.groups.length, 2); assert.equal(result.complete, false); assert.ok(!JSON.stringify(result).includes("test-plan")); });
