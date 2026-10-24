import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  matchingBadgeUserIds,
  normalizeBadgeCriteria,
  type BadgeDonationRow,
  type BadgeSubscriptionRow,
} from "../../lib/badge-criteria-core";

const now = new Date("2026-10-24T12:00:00.000Z");
function donation(donorId: string, date: string, amountUSD: number, status = "PAID"): BadgeDonationRow {
  return { donorId, amountUSD, amount: amountUSD, currency: "USD", status, paidAt: new Date(date) };
}

test("badge criteria validation rejects missing, non-finite, and out-of-range values", () => {
  assert.equal(normalizeBadgeCriteria({ type: "TOTAL_LIFETIME" }), null);
  assert.equal(normalizeBadgeCriteria({ type: "DONATION_COUNT_MIN", count: 0 }), null);
  assert.equal(normalizeBadgeCriteria({ type: "ANY_SPAN_N_MONTHS", months: 121, amountMinUSD: 50 }), null);
  assert.equal(normalizeBadgeCriteria({ type: "MONTHLY_ACTIVE_RANGE", amountMinUSD: 80, amountMaxUSD: 40 }), null);
  assert.deepEqual(normalizeBadgeCriteria({ type: "DONATION_COUNT_MIN", count: 3, amountMinUSD: 999 }), { type: "DONATION_COUNT_MIN", count: 3 });
});

test("lifetime totals and donation counts use settled records only", () => {
  const rows = [
    donation("paid", "2026-10-01T00:00:00.000Z", 100),
    donation("paid", "2026-10-05T00:00:00.000Z", 20),
    { ...donation("pending", "2026-10-02T00:00:00.000Z", 1000, "PAID"), paidAt: null },
    { ...donation("not-settled", "2026-10-02T00:00:00.000Z", 500), paidAt: null },
    donation("failed", "2026-10-02T00:00:00.000Z", 1000, "FAILED"),
  ];
  assert.deepEqual(matchingBadgeUserIds({ type: "TOTAL_LIFETIME", amountMinUSD: 120 }, rows, [], now), ["paid"]);
  assert.deepEqual(matchingBadgeUserIds({ type: "DONATION_COUNT_MIN", count: 2 }, rows, [], now), ["paid"]);
});

test("rolling and consecutive-month criteria use payment dates and include gaps as zero", () => {
  const rows = [
    donation("recent", "2026-09-24T12:00:00.000Z", 60),
    donation("recent", "2026-10-02T12:00:00.000Z", 50),
    donation("old", "2026-09-23T12:00:00.000Z", 200),
    donation("span", "2026-08-04T12:00:00.000Z", 60),
    donation("span", "2026-10-04T12:00:00.000Z", 60),
    donation("continuous", "2026-08-04T12:00:00.000Z", 60),
    donation("continuous", "2026-09-04T12:00:00.000Z", 60),
  ];
  assert.deepEqual(matchingBadgeUserIds({ type: "TOTAL_LAST_N_MONTHS", months: 1, amountMinUSD: 100 }, rows, [], now), ["recent"]);
  // The two-month window can contain one high-donation month and one zero month.
  assert.deepEqual(matchingBadgeUserIds({ type: "ANY_SPAN_N_MONTHS", months: 2, amountMinUSD: 100 }, rows, [], now), ["recent", "old", "continuous"]);
});

test("active subscription criteria sum monthly commitments and ignore other frequencies", () => {
  const subscriptions: BadgeSubscriptionRow[] = [
    { donorId: "monthly", amountUSD: 30, amount: 30, currency: "USD", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "monthly", amountUSD: 20, amount: 20, currency: "USD", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "monthly", amountUSD: 100, amount: 100, currency: "USD", status: "ACTIVE", frequency: "WEEKLY" },
    { donorId: "inactive", amountUSD: 50, amount: 50, currency: "USD", status: "CANCELLED", frequency: "MONTHLY" },
  ];
  assert.deepEqual(matchingBadgeUserIds({ type: "MONTHLY_ACTIVE_RANGE", amountMinUSD: 50, amountMaxUSD: 50 }, [], subscriptions), ["monthly"]);
});

test("database badge queries apply paid-only and monthly-only filters and never widen an empty candidate list", () => {
  const source = readFileSync("lib/badge-criteria.ts", "utf8");
  assert.match(source, /candidateUserIds !== undefined && candidateUserIds\.length === 0/);
  assert.match(source, /AND: \[candidateWhere, PAID_DONATION_FILTER\]/);
  assert.match(source, /frequency: "MONTHLY"/);
  assert.match(source, /BADGE_SCAN_BATCH_SIZE/);
});

test("a monthly amount range never treats an unknown foreign-currency commitment as zero", () => {
  const subscriptions: BadgeSubscriptionRow[] = [
    { donorId: "unknown", amountUSD: null, amount: 500, currency: "EUR", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "partial", amountUSD: 20, amount: 20, currency: "USD", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "partial", amountUSD: null, amount: 500, currency: "EUR", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "known", amountUSD: 40, amount: 40, currency: "EUR", status: "ACTIVE", frequency: "MONTHLY" },
    { donorId: "usd-fallback", amountUSD: null, amount: 30, currency: "USD", status: "ACTIVE", frequency: "MONTHLY" },
  ];
  assert.deepEqual(matchingBadgeUserIds({ type: "MONTHLY_ACTIVE_RANGE", amountMinUSD: 0, amountMaxUSD: 100 }, [], subscriptions), ["known", "usd-fallback"]);
});
