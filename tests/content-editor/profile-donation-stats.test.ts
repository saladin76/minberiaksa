import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { isSettledProfileDonation, profileDonationMatchesPeriod, successfulRecurringMonthCount } from "../../lib/minbar/profile-donation-stats";

const zone = "Europe/Istanbul";
const gift = { subscriptionId: "plan", status: "ACTIVE", paymentStatus: "PAID", paidAt: "2026-11-02T09:00:00Z", createdAt: "2026-11-01T08:00:00Z" };

test("failed attempts on an active plan never count as payments or donation months", () => {
  for (const paymentStatus of ["FAILED", "PENDING", "CANCELLED", "REFUNDED", "ACTIVE", null]) {
    const row = { ...gift, paymentStatus };
    assert.equal(isSettledProfileDonation(row), false);
    assert.equal(successfulRecurringMonthCount([row], zone), 0);
  }
  for (const paidAt of [null, "", "invalid"]) assert.equal(successfulRecurringMonthCount([{ ...gift, paidAt }], zone), 0);
});

test("daily, Friday and monthly gifts and repeated attempts in one month count once", () => {
  for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"]) { const row={ ...gift, frequency };assert.equal(successfulRecurringMonthCount([row], zone), 1); }
  const rows = [gift, gift, { ...gift, subscriptionId: "another" }, ...["FAILED", "PENDING"].map(paymentStatus => ({ ...gift, paymentStatus }))];
  assert.equal(successfulRecurringMonthCount(rows, zone), 1);
  assert.equal(successfulRecurringMonthCount([...rows, { ...gift, paidAt: "2026-10-10T09:00:00Z" }], zone), 2);
  assert.equal(successfulRecurringMonthCount([...rows, { ...gift, paidAt: "2025-11-10T09:00:00Z" }], zone), 2);
  assert.equal(successfulRecurringMonthCount([{ ...gift, status: "CANCELLED" }], zone), 1, "past giving survives a later plan cancellation");
});

test("test cycles and one-time gifts cannot create a recurring giving month", () => {
  assert.equal(successfulRecurringMonthCount([{ ...gift, billingReason: "subscription_test_cycle" }, { ...gift, subscriptionId: null }], zone), 0);
  assert.equal(isSettledProfileDonation({ ...gift, subscriptionId: null }), true, "one-time confirmed gifts still contribute to payment totals");
});

test("month/year filters use settlement time in the displayed timezone and keep failed history visible", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const retry = { ...gift, createdAt: "2026-10-31T20:00:00Z", paidAt: "2026-10-31T21:30:00Z" };
  assert.equal(profileDonationMatchesPeriod(retry, "month", now, zone), true);
  assert.equal(profileDonationMatchesPeriod(retry, "month", now, "UTC"), false);
  const failed = { ...retry, paymentStatus: "FAILED", paidAt: null };
  assert.equal(profileDonationMatchesPeriod(failed, "month", now, zone), false);
  assert.equal(profileDonationMatchesPeriod(failed, "year", now, zone), true);
  const rows = [retry, { ...gift, paidAt: "2025-11-10T09:00:00Z" }, { ...gift, paidAt: "2026-09-10T09:00:00Z" }];
  assert.equal(successfulRecurringMonthCount(rows.filter(row => profileDonationMatchesPeriod(row, "month", now, zone)), zone), 1);
  assert.equal(successfulRecurringMonthCount(rows.filter(row => profileDonationMatchesPeriod(row, "year", now, zone)), zone), 2);
});

test("every public locale explains actual donation months instead of active subscriptions", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = JSON.parse(readFileSync(`i18n/messages/${locale}.json`, "utf8")).Profile.donations;
    assert.equal(typeof copy.recurringGivingMonths, "string");
    assert.ok(copy.recurringGivingMonthsHint.length > 10, locale);
    assert.notEqual(copy.recurringGivingMonthsHint, copy.activeSubscription, locale);
  }
});
