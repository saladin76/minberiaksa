import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionLifecycle, subscriptionLifecycleWhere, ACTIVATING_DONATION_WHERE } from "../../lib/donations/subscription-lifecycle";

test("an optimistic ACTIVE row is not an active subscription before its first settled payment", () => {
  for (const status of ["ACTIVE", "PAUSED", "PAYMENT_FAILED"]) assert.equal(subscriptionLifecycle({ status, hasPaidDonation: false }), "AWAITING_FIRST_PAYMENT");
  assert.equal(subscriptionLifecycle({ status: "CANCELLED", hasPaidDonation: false }), "CANCELLED");
  assert.equal(subscriptionLifecycle({ status: "ACTIVE", hasPaidDonation: true }), "ACTIVE");
});
test("a failed renewal immediately needs follow-up while internal retries keep their existing state", () => {
  const plan = { status: "ACTIVE", hasPaidDonation: true, chargeAttempts: 1, lastChargeError: "Issuer declined" };
  assert.equal(subscriptionLifecycle(plan), "PAYMENT_FAILED");
  assert.equal(plan.status, "ACTIVE", "a reporting read cannot stop the retry ladder");
  assert.equal(subscriptionLifecycle({ ...plan, chargeAttempts: 0, lastChargeError: null }), "ACTIVE");
  assert.equal(subscriptionLifecycle({ ...plan, status: "PAUSED" }), "PAUSED");
  assert.equal(subscriptionLifecycle({ ...plan, status: "CANCELLED" }), "CANCELLED");
});

type Row = Record<string, unknown>;
function matches(row: Row, query: Row): boolean {
  return Object.entries(query).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === "OR") return (value as Row[]).some(part => matches(row, part));
    if (key === "NOT") return !(Array.isArray(value) ? value : [value]).some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as Row;
      if ("some" in filter) return (row[key] as Row[]).some(part => matches(part, filter.some as Row));
      if ("none" in filter) return !(row[key] as Row[]).some(part => matches(part, filter.none as Row));
      if ("isSet" in filter) return (row[key] !== undefined) === filter.isSet;
      if ("gt" in filter) return Number(row[key]) > Number(filter.gt);
      if ("not" in filter) return row[key] !== undefined && row[key] !== filter.not;
    }
    return row[key] === value;
  });
}
test("the paginated default and active totals reject failed, abandoned and synthetic-only signups", () => {
  const settled = { status: "PAID", paidAt: new Date(), billingReason: null };
  const rows = [
    { id: "failed", donations: [{ status: "FAILED", paidAt: null }] },
    { id: "pending", donations: [{ status: "PAID", paidAt: null }] },
    { id: "test", donations: [{ ...settled, billingReason: "subscription_test_cycle" }] },
    { id: "confirmed", donations: [settled] },
    { id: "legacy", donations: [{ status: "PAID", paidAt: new Date() }] },
  ].map(row => ({ status: "ACTIVE", chargeAttempts: 0, ...row }));
  assert.deepEqual(rows.filter(row => matches(row, subscriptionLifecycleWhere("ACTIVE") as Row)).map(row => row.id), ["confirmed", "legacy"]);
  assert.deepEqual(rows.filter(row => matches(row, subscriptionLifecycleWhere("ALL") as Row)).map(row => row.id), ["confirmed", "legacy"]);
  assert.deepEqual(rows.filter(row => matches(row, subscriptionLifecycleWhere("AWAITING_FIRST_PAYMENT") as Row)).map(row => row.id), ["failed", "pending", "test"]);
  assert.equal(matches({ ...settled, status: "FAILED" }, ACTIVATING_DONATION_WHERE as Row), false);
});
test("failed renewal filtering includes the first scheduled retry and respects cancelled plans", () => {
  const plan = { status: "ACTIVE", donations: [{ status: "PAID", paidAt: new Date() }], chargeAttempts: 1, lastChargeError: "Declined" };
  assert.equal(matches(plan, subscriptionLifecycleWhere("PAYMENT_FAILED") as Row), true);
  assert.equal(matches(plan, subscriptionLifecycleWhere("ACTIVE") as Row), false);
  assert.equal(matches({ ...plan, status: "CANCELLED" }, subscriptionLifecycleWhere("PAYMENT_FAILED") as Row), false);
});
