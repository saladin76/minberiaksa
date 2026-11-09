import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceProtection, DEFAULT_DONATION_PROTECTION, initialProtectionState, paymentRestriction, releaseProtection } from "../../lib/site-security/donation-abuse-policy";

const start = 1_800_000_000_000;
const event = (i: number, result: "BANK_DECLINED" | "PENDING" | "PROVIDER_ERROR" | "PAID" = "BANK_DECLINED") => ({
  eventId: "evt-" + i, paymentId: "pay-" + i, at: start + i * 1000, result,
});
test("four confirmed declines cause five minute payment-only cooldown", () => {
  let s = initialProtectionState(start);
  for (let i = 1; i <= 4; i++) s = advanceProtection(s, event(i), start + i * 1000);
  assert.equal(s.phase, "COOLDOWN");
  assert.equal(paymentRestriction(s, start + 5000).reason, "COOLDOWN");
  assert.equal(paymentRestriction(s, s.until!).blocked, false);
});
test("three more declines after cooldown require a manual review block", () => {
  let s = initialProtectionState(start);
  for (let i = 1; i <= 4; i++) s = advanceProtection(s, event(i), start + i * 1000);
  const after = s.until! + 1000;
  for (let i = 5; i <= 7; i++) s = advanceProtection(s, event(i), after + i * 1000);
  assert.equal(s.phase, "REVIEW_BLOCK");
  assert.equal(paymentRestriction(s, after + 25 * 3600_000).reason, "MANUAL_REVIEW");
  assert.equal(paymentRestriction(releaseProtection(after), after).blocked, false);
});
test("pending, paid, transport errors and duplicate events never count as failures", () => {
  let s = initialProtectionState(start);
  s = advanceProtection(s, event(1, "PENDING"), start + 1000);
  s = advanceProtection(s, event(2, "PROVIDER_ERROR"), start + 2000);
  s = advanceProtection(s, event(3, "PAID"), start + 3000);
  s = advanceProtection(s, event(4), start + 4000);
  const duplicate = advanceProtection(s, event(4), start + 5000);
  assert.deepEqual(duplicate, s);
  assert.equal(s.failedAttempts, 1);
});
test("failures outside the initial window reset the first-stage counter", () => {
  let s = advanceProtection(initialProtectionState(start), event(1), start + 1000);
  s = advanceProtection(s, event(2), start + DEFAULT_DONATION_PROTECTION.windowMs + 1000);
  assert.equal(s.phase, "NORMAL");
  assert.equal(s.failedAttempts, 1);
});

test("probation expires after its observation window instead of escalating old failures", () => {
  let state = initialProtectionState(start);
  for (let i = 1; i <= 4; i++) state = advanceProtection(state, event(i), start + i * 1000);
  const probationStarted = state.until! + 1000;
  state = advanceProtection(state, event(5), probationStarted);
  assert.equal(state.phase, "PROBATION");
  state = advanceProtection(state, event(6), probationStarted + DEFAULT_DONATION_PROTECTION.windowMs + 1000);
  assert.equal(state.phase, "NORMAL");
  assert.equal(state.failedAttempts, 1);
  assert.equal(paymentRestriction(state, probationStarted + DEFAULT_DONATION_PROTECTION.windowMs + 2000).blocked, false);
});
