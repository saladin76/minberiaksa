import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_CONSECUTIVE_DECLINES, classifyRecurringDecline, nextAttemptAfterDecline, nextChargeForPlan, shouldTellDonorAboutDecline } from "../../lib/donations/recurring-schedule";

const NOW = new Date("2026-11-18T10:00:00Z");
const monthly = { frequency: "MONTHLY", timezone: "Europe/Istanbul" };
const daily = { frequency: "DAILY", timezone: "Europe/Istanbul" };
const H = 3_600_000;

test("decline kinds: lost/stolen/closed/invalid never retried; our terminal errors are ours; the rest is worth retrying", () => {
  for (const iso of ["04", "07", "14", "15", "33", "41", "43", "54", "62", "4"]) assert.equal(classifyRecurringDecline(iso, "x"), "hard", iso);
  assert.equal(classifyRecurringDecline(null, "UNAUTHORIZED REQUEST"), "merchant");
  assert.equal(classifyRecurringDecline("", "İşyeri/Terminal hatası"), "merchant");
  for (const reason of ["Limit Yetersiz", "Onaylanmadi", "Fraud Şüphesi", "Politika Gereği Reddedildi"]) assert.equal(classifyRecurringDecline("51", reason), "soft", reason);
});

test("in the cycle the ladder runs (1h, 6h, 24h); after it, the next regular charge — not a stop", () => {
  assert.equal(nextAttemptAfterDecline(monthly, 1, NOW, "soft")?.getTime(), NOW.getTime() + 1 * H);
  assert.equal(nextAttemptAfterDecline(monthly, 2, NOW, "soft")?.getTime(), NOW.getTime() + 6 * H);
  assert.equal(nextAttemptAfterDecline(monthly, 3, NOW, "soft")?.getTime(), NOW.getTime() + 24 * H);
  const after = nextAttemptAfterDecline(monthly, 4, NOW, "soft");
  assert.ok(after, "a monthly plan is not given up after one cycle");
  assert.equal(after.getTime(), nextChargeForPlan(monthly, NOW).getTime(), "it waits for next month's regular charge");
  assert.ok(after.getTime() - NOW.getTime() > 20 * 24 * H, "next month, not tomorrow");
  const d = nextAttemptAfterDecline(daily, 5, NOW, "soft");
  assert.ok(d && d.getTime() - NOW.getTime() <= 48 * H, "a daily plan tries again on its next day");
  assert.equal(nextAttemptAfterDecline(monthly, 4, NOW, "merchant")?.getTime(), nextChargeForPlan(monthly, NOW).getTime(), "our own errors never stop the plan early");
});

test("it stops at once on a hard decline, and after the consecutive cap (card-network limits)", () => {
  assert.equal(nextAttemptAfterDecline(monthly, 1, NOW, "hard"), null);
  assert.equal(MAX_CONSECUTIVE_DECLINES, 12);
  assert.ok(nextAttemptAfterDecline(daily, MAX_CONSECUTIVE_DECLINES - 1, NOW, "soft"));
  assert.equal(nextAttemptAfterDecline(daily, MAX_CONSECUTIVE_DECLINES, NOW, "soft"), null);
});

test("the donor hears once per streak and when the plan stops — never about our terminal", () => {
  assert.equal(shouldTellDonorAboutDecline(1, false, "soft"), true);
  assert.equal(shouldTellDonorAboutDecline(2, false, "soft"), false);
  assert.equal(shouldTellDonorAboutDecline(4, false, "soft"), false);
  assert.equal(shouldTellDonorAboutDecline(12, true, "soft"), true);
  assert.equal(shouldTellDonorAboutDecline(1, true, "hard"), true);
  assert.equal(shouldTellDonorAboutDecline(1, false, "merchant"), false);
});

test("wiring: the Albaraka charge uses the policy for both the schedule and the donor message", () => {
  const s = fs.readFileSync("lib/donations/albaraka-recurring.ts", "utf8");
  assert.match(s, /const retryAt = nextAttemptAfterDecline\(sub, attempt, now, kind\);/);
  assert.match(s, /const kind = txnResult === "Unknown" \? "soft" : classifyRecurringDecline\(declineIso, reason\);/);
  assert.match(s, /if \(!rehearsal && shouldTellDonorAboutDecline\(attempt, !retryAt, kind\)\) \{\s*\n\s*runAfterResponse\(\(\) => dispatchEvent\("DONATION_FAILED"/);
  assert.match(s, /\? \{ chargeAttempts: attempt, nextBillingDate: retryAt, lastChargeError: reason\.slice\(0, 300\) \}\s*\n\s*: \{ status: "PAYMENT_FAILED"/, "stopping still keeps the plan for a new card (not a cancellation)");
});
