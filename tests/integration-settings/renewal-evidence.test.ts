import test from "node:test";
import assert from "node:assert/strict";
import { renewalEvidence, type RenewalRow } from "../../lib/donations/renewal-evidence";
const since = new Date("2026-10-01T00:00:00Z");
const row = (patch: Partial<RenewalRow> = {}): RenewalRow => ({ provider: "ALBARAKA", billingReason: "subscription_cycle", providerTxnType: "RecurringSale", subscriptionId: "plan", paidAt: null, status: "FAILED", providerTxnResult: "Failed", providerProcReturnCode: "05", createdAt: new Date("2026-11-01T10:00:00Z"), ...patch });
test("signup success and a future schedule never become proof of automatic renewal", () => {
  const data = renewalEvidence([row({ billingReason: "subscription_create", providerTxnType: "Sale", status: "PAID", paidAt: new Date() }), row({ subscriptionId: null })], () => "MONTHLY", since, true);
  assert.equal(data.groups.length, 0);
});
test("confirmed, declined and unresolved renewals remain separate by provider and cadence", () => {
  const data = renewalEvidence([row(), row({ status: "PAID", paidAt: new Date("2026-11-01T12:00:00Z") }), row({ status: "PAID", providerTxnResult: "PendingConfirmation" }), row({ status: "FAILED", providerTxnResult: "Unknown" }), row({ provider: "PAYPAL", providerProcReturnCode: "DECLINED" })], () => "MONTHLY", since, false);
  assert.equal(data.complete, false); assert.deepEqual(data.groups[0], { provider: "ALBARAKA", frequency: "MONTHLY", confirmed: 1, declined: 1, notCollected: 0, unresolved: 2, latestConfirmedAt: "2026-11-01T12:00:00.000Z", lastDeclineCode: "05" });
  assert.equal(data.groups[1].provider, "PAYPAL"); assert.equal(data.groups[1].confirmed, 0);
});

test("local failures without a bank refusal stay separate from bank declines and uncertain responses", () => {
  const data = renewalEvidence([row({ providerProcReturnCode: null }), row({ providerProcReturnCode: "0000" }), row({ providerTxnResult: "Unknown", providerProcReturnCode: "05" })], () => "MONTHLY", since, true);
  assert.equal(data.groups[0].declined, 0); assert.equal(data.groups[0].notCollected, 2); assert.equal(data.groups[0].unresolved, 1);
});
