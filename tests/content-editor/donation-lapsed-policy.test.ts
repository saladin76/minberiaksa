import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTLED_DONATION_WHERE, REMINDER_FAILED_RETRY_BACKOFF_DAYS,
  reminderFailureBackoffDays, reminderPreviousAttemptWindows,
} from "../../lib/events/donation-lapsed-policy";

test("donation lapse eligibility relies on settled paidAt, not optimistic PAID status", () => {
  assert.deepEqual(SETTLED_DONATION_WHERE, { status: "PAID", paidAt: { not: null } });
});

test("failed reminder backoff is bounded, and cannot exceed configured cooldown", () => {
  assert.equal(REMINDER_FAILED_RETRY_BACKOFF_DAYS, 7);
  assert.equal(reminderFailureBackoffDays(90), 7);
  assert.equal(reminderFailureBackoffDays(30), 7);
  assert.equal(reminderFailureBackoffDays(1), 1);
});

test("successful messages respect full cooldown while failures back off for seven days", () => {
  const cooldown = new Date("2026-08-10T00:00:00.000Z");
  const failed = new Date("2026-11-01T00:00:00.000Z");
  const windows = reminderPreviousAttemptWindows(cooldown, failed);
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[0].createdAt, { gte: cooldown });
  assert.deepEqual(windows[1].createdAt, { gte: failed });
  assert.ok(windows[0].status.in.includes("SENT"));
  assert.ok(windows[0].status.in.includes("DELIVERED"));
  assert.ok(windows[1].status.in.includes("FAILED"));
  assert.ok(windows[1].status.in.includes("SKIPPED"));
  assert.equal(windows[0].status.in.includes("FAILED"), false);
  assert.equal(windows[1].status.in.includes("SENT"), false);
});
