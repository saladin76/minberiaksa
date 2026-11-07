import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionReductionEligibility } from "../../lib/donations/subscription-reduction-policy";

const now = new Date("2026-11-01T17:00:00Z");
const plan = { status: "ACTIVE", nextBillingDate: new Date("2026-11-04T17:00:00Z"), chargeAttempts: 0 };

test("reduction gates retain the 24-hour boundary and permit legacy rows without optional fields", () => {
  assert.equal(subscriptionReductionEligibility(plan, now).allowed, true);
  assert.equal(subscriptionReductionEligibility({ ...plan, status: "PAUSED" }, now).allowed, true);
  for (const offset of [-1, 0, 24 * 3600_000 - 1]) {
    assert.equal(subscriptionReductionEligibility({ ...plan, nextBillingDate: new Date(+now + offset) }, now).reason, "BILLING_DUE_SOON");
  }
  assert.equal(subscriptionReductionEligibility({ status: "ACTIVE", nextBillingDate: new Date(+now + 24 * 3600_000) }, now).allowed, true);
  for (const status of ["CANCELLED", "PAYMENT_FAILED"]) assert.equal(subscriptionReductionEligibility({ ...plan, status }, now).reason, "PLAN_INACTIVE");
});

test("retries remain blocked beyond the billing window; missing schedules and active leases are distinct", () => {
  assert.equal(subscriptionReductionEligibility({ ...plan, chargeAttempts: 2 }, now).reason, "RETRY_PENDING");
  assert.equal(subscriptionReductionEligibility({ ...plan, nextBillingDate: null }, now).reason, "SCHEDULE_MISSING");
  assert.equal(subscriptionReductionEligibility({ ...plan, nextBillingDate: new Date(NaN) }, now).reason, "SCHEDULE_MISSING");
  assert.equal(subscriptionReductionEligibility({ ...plan, billingLeaseUntil: new Date(+now + 1) }, now).reason, "BILLING_IN_PROGRESS");
  assert.equal(subscriptionReductionEligibility({ ...plan, billingLeaseUntil: now }, now).allowed, true);
  const locked = { ...plan, amountChangeLock: "private-lock", chargeAttempts: 2 };
  const before = JSON.stringify(locked), result = subscriptionReductionEligibility(locked, now);
  assert.equal(result.reason, "RECONCILIATION_REQUIRED"); assert.equal(result.checkedAt, now.toISOString());
  assert.doesNotMatch(JSON.stringify(result), /private-lock/); assert.equal(JSON.stringify(locked), before);
});
