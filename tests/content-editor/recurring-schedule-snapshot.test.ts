import test from "node:test";
import assert from "node:assert/strict";
import { recurringReadiness } from "../../lib/donations/recurring-readiness";
import { recurringScheduleSnapshot } from "../../lib/donations/recurring-schedule-snapshot";
const now = new Date("2026-10-29T12:00:00Z");
const base = { status: "ACTIVE", provider: "ALBARAKA", hasPaidDonation: true, lastBillingDate: new Date("2026-10-01T12:00:00Z"), nextBillingDate: new Date("2026-10-30T12:00:00Z"), paymentCardId: "fixture-card" };

test("an invalid, missing or reversed billing date is never labelled scheduled", () => {
  assert.equal(recurringReadiness({ ...base, nextBillingDate: null }, now), "schedule_missing");
  assert.equal(recurringReadiness({ ...base, nextBillingDate: new Date("invalid") }, now), "schedule_invalid");
  assert.equal(recurringReadiness({ ...base, nextBillingDate: base.lastBillingDate }, now), "schedule_invalid");
  assert.equal(recurringReadiness({ ...base, lastBillingDate: null }, now), "billing_history_missing");
  assert.equal(recurringReadiness({ ...base, hasPaidDonation: false, lastBillingDate: null }, now), "awaiting_first_payment");
});
test("a schedule snapshot separates future, due, provider-managed and blocked plans without changing them", () => {
  const plans = [base, { ...base, nextBillingDate: new Date("2026-11-02T12:00:00Z") }, { ...base, nextBillingDate: new Date("2026-10-28T12:00:00Z") }, { ...base, nextBillingDate: null }, { ...base, paymentCardId: null }, { ...base, status: "CANCELED" }, { ...base, provider: "STRIPE", stripeSubscriptionId: "fixture-plan" }];
  const initial = structuredClone(plans), snapshot = recurringScheduleSnapshot(now);
  plans.forEach(plan => snapshot.add(plan)); const result = snapshot.result();
  assert.equal(result.counts.scheduled, 2); assert.equal(result.counts.due, 1); assert.equal(result.counts.schedule_missing, 1);
  assert.equal(result.counts.authorization_missing, 1); assert.equal(result.counts.inactive, 1); assert.equal(result.counts.provider_managed, 1);
  assert.equal(result.nextScheduledAt, "2026-10-30T12:00:00.000Z"); assert.equal(result.earliestOverdueAt, "2026-10-28T12:00:00.000Z"); assert.equal(result.next24Hours, 1);
  assert.deepEqual(plans, initial); assert.doesNotMatch(JSON.stringify(result), /fixture-card|fixture-plan/);
});
