import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETRY_HOURS,
  FRIDAY_CHARGE_HOUR,
  chargesPerMonth,
  consentSnapshotFor,
  firstChargeAfterCheckout,
  firstChargeForPlan,
  frequencyOfOrderType,
  isOrderType,
  nextChargeAt,
  nextChargeForPlan,
  nextChargeFromRule,
  nextRetryAt,
  normalizeTimezone,
  orderTypeForFreqKey,
  orderTypeForItems,
  parseScheduleChoice,
  parseScheduleRule,
  railForFrequency,
  retryLadderHours,
  scheduleRuleFor,
  stripeRecurringFor,
  wallClock,
} from "../../lib/donations/recurring-schedule";

/**
 * Contract tests for `DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2  the frequency a
 * donor picks must be the frequency the plan is billed on, on the rail that
 * bills that cadence. These run in `npm run build`.
 */

test("donation contract: once → ONE_TIME, daily → DAILY, friday → FRIDAY, monthly → MONTHLY", () => {
  assert.equal(orderTypeForFreqKey("once"), "ONE_TIME");
  assert.equal(orderTypeForFreqKey("daily"), "DAILY");
  assert.equal(orderTypeForFreqKey("friday"), "FRIDAY");
  assert.equal(orderTypeForFreqKey("monthly"), "MONTHLY");
});

test("a basket's order type follows its recurring row and never collapses to MONTHLY", () => {
  assert.equal(orderTypeForItems([{ freqKey: "once" }, { freqKey: "once" }]), "ONE_TIME");
  assert.equal(orderTypeForItems([{ freqKey: "once" }, { freqKey: "daily" }]), "DAILY");
  assert.equal(orderTypeForItems([{ freqKey: "friday" }]), "FRIDAY");
  assert.equal(orderTypeForItems([{ freqKey: "monthly" }]), "MONTHLY");
  assert.equal(orderTypeForItems([]), "ONE_TIME");
});

test("order type validation and frequency extraction", () => {
  for (const t of ["ONE_TIME", "DAILY", "FRIDAY", "MONTHLY"]) assert.ok(isOrderType(t), t);
  assert.equal(isOrderType("WEEKLY"), false);
  assert.equal(isOrderType("once"), false);
  assert.equal(frequencyOfOrderType("ONE_TIME"), null);
  assert.equal(frequencyOfOrderType("FRIDAY"), "FRIDAY");
});

test("rail: Stripe keeps one-time + monthly; daily and Friday plans are Albaraka's", () => {
  assert.equal(railForFrequency("DAILY", "STRIPE"), "ALBARAKA");
  assert.equal(railForFrequency("FRIDAY", "STRIPE"), "ALBARAKA");
  assert.equal(railForFrequency("DAILY", "ALBARAKA"), "ALBARAKA");
  assert.equal(railForFrequency("FRIDAY", "ALBARAKA"), "ALBARAKA");
  // Monthly follows the main gateway.
  assert.equal(railForFrequency("MONTHLY", "STRIPE"), "STRIPE");
  assert.equal(railForFrequency("MONTHLY", "ALBARAKA"), "ALBARAKA");
});

test("monthly equivalent: daily ≈30.44 charges, Friday ≈4.35, monthly exactly 1", () => {
  assert.equal(chargesPerMonth("MONTHLY"), 1);
  assert.ok(Math.abs(chargesPerMonth("DAILY") - 30.4375) < 1e-9);
  assert.ok(Math.abs(chargesPerMonth("FRIDAY") - 365.25 / 7 / 12) < 1e-9);
  // A year of each cadence is the charges a year actually holds.
  assert.ok(Math.abs(chargesPerMonth("DAILY") * 12 - 365.25) < 1e-9);
  assert.ok(Math.abs(chargesPerMonth("FRIDAY") * 12 - 52.178571) < 1e-5);
});

test("timezones are validated, never trusted from the browser", () => {
  assert.equal(normalizeTimezone("Europe/Istanbul"), "Europe/Istanbul");
  assert.equal(normalizeTimezone("Not/AZone"), "UTC");
  assert.equal(normalizeTimezone(""), "UTC");
  assert.equal(normalizeTimezone(42), "UTC");
  assert.equal(normalizeTimezone(undefined, "Asia/Riyadh"), "Asia/Riyadh");
});

test("DAILY: same wall time tomorrow, across a daylight-saving change", () => {
  // 2026-03-07 12:00 New York is EST (UTC-5); the next day is EDT (UTC-4).
  const from = new Date("2026-03-07T17:00:00Z");
  const next = nextChargeAt("DAILY", from, "America/New_York");
  const wall = wallClock(next, "America/New_York");
  assert.deepEqual([wall.year, wall.month, wall.day, wall.hour, wall.minute], [2026, 3, 8, 12, 0]);
  // 23 real hours, not 24: the clock, not the elapsed time, is what the donor chose.
  assert.equal((next.getTime() - from.getTime()) / 3_600_000, 23);
});

test("FRIDAY: the first Friday at the charge hour strictly after `from`, in the plan's zone", () => {
  const tz = "Europe/Istanbul"; // UTC+3, no DST
  // Wednesday 2026-09-23 10:00 Istanbul → Friday 2026-09-25 09:00 Istanbul = 06:00Z
  const wed = new Date("2026-09-23T07:00:00Z");
  assert.equal(nextChargeAt("FRIDAY", wed, tz).toISOString(), "2026-09-25T06:00:00.000Z");

  // Friday 08:00 Istanbul, before the charge hour → the same Friday at 09:00
  const friEarly = new Date("2026-09-25T05:00:00Z");
  assert.equal(nextChargeAt("FRIDAY", friEarly, tz).toISOString(), "2026-09-25T06:00:00.000Z");

  // Friday 10:00 Istanbul, after the charge hour → next Friday
  const friLate = new Date("2026-09-25T07:00:00Z");
  assert.equal(nextChargeAt("FRIDAY", friLate, tz).toISOString(), "2026-10-02T06:00:00.000Z");

  // Exactly the charge instant → the following week, never a double charge
  const friExact = new Date("2026-09-25T06:00:00Z");
  assert.equal(nextChargeAt("FRIDAY", friExact, tz).toISOString(), "2026-10-02T06:00:00.000Z");

  assert.equal(wallClock(nextChargeAt("FRIDAY", wed, tz), tz).hour, FRIDAY_CHARGE_HOUR);
});

test("FRIDAY resolves in the donor's zone, not the server's", () => {
  // 2026-09-24 20:00Z is Thursday in London but already Friday 05:00 in Tokyo.
  const at = new Date("2026-09-24T20:00:00Z");
  const tokyo = nextChargeAt("FRIDAY", at, "Asia/Tokyo");
  const london = nextChargeAt("FRIDAY", at, "Europe/London");
  assert.equal(tokyo.toISOString(), "2026-09-25T00:00:00.000Z"); // Fri 09:00 JST
  assert.equal(london.toISOString(), "2026-09-25T08:00:00.000Z"); // Fri 09:00 BST
});

test("MONTHLY: same day next month, clamped to the last day of a shorter month", () => {
  const tz = "Asia/Kolkata"; // UTC+5:30
  // 31 Jan 2026 14:30 Kolkata → 28 Feb 2026 14:30 (2026 is not a leap year)
  const jan31 = new Date("2026-01-31T09:00:00Z");
  const feb = nextChargeAt("MONTHLY", jan31, tz);
  const w = wallClock(feb, tz);
  assert.deepEqual([w.year, w.month, w.day, w.hour, w.minute], [2026, 2, 28, 14, 30]);

  // December rolls the year
  const dec15 = new Date("2026-12-15T09:00:00Z");
  const jan = wallClock(nextChargeAt("MONTHLY", dec15, tz), tz);
  assert.deepEqual([jan.year, jan.month, jan.day], [2027, 1, 15]);
});

test("schedule rules are structure, never prose", () => {
  const at = new Date("2026-09-15T12:00:00Z");
  // Without a donor choice the rule is the creation moment's, as structure.
  assert.deepEqual(scheduleRuleFor("DAILY", at, "UTC"), { kind: "daily", hour: 12, minute: 0 });
  assert.deepEqual(scheduleRuleFor("FRIDAY", at, "UTC"), { kind: "weekday", weekday: 5, hour: FRIDAY_CHARGE_HOUR, minute: 0 });
  assert.deepEqual(scheduleRuleFor("MONTHLY", at, "UTC"), { kind: "monthDay", day: 15, hour: 12, minute: 0 });
  // Month-day is read in the plan's zone: 23:30Z on the 15th is already the 16th in Tokyo.
  assert.deepEqual(scheduleRuleFor("MONTHLY", new Date("2026-09-15T23:30:00Z"), "Asia/Tokyo"), { kind: "monthDay", day: 16, hour: 8, minute: 30 });
  // With a choice, the rule is the donor's day and time, not the creation moment's.
  const choice = { dayOfMonth: 15, hour: 14, minute: 30 };
  assert.deepEqual(scheduleRuleFor("MONTHLY", new Date("2026-10-04T09:00:00Z"), "Europe/Istanbul", choice), { kind: "monthDay", day: 15, hour: 14, minute: 30 });
  assert.deepEqual(scheduleRuleFor("DAILY", at, "UTC", choice), { kind: "daily", hour: 14, minute: 30 });
  assert.deepEqual(scheduleRuleFor("FRIDAY", at, "UTC", { hour: 9, minute: 0 }), { kind: "weekday", weekday: 5, hour: 9, minute: 0 });
});

test("retry ladder: configurable, defaults to 1h / 6h / 24h, then stops", () => {
  assert.deepEqual([...retryLadderHours(undefined)], [...DEFAULT_RETRY_HOURS]);
  assert.deepEqual([...retryLadderHours("2, 12 ,48")], [2, 12, 48]);
  assert.deepEqual([...retryLadderHours("nonsense")], [...DEFAULT_RETRY_HOURS]);
  assert.deepEqual([...retryLadderHours("0,-3")], [...DEFAULT_RETRY_HOURS]);

  const failedAt = new Date("2026-09-25T06:00:00Z");
  assert.equal(nextRetryAt(1, failedAt, [1, 6, 24])?.toISOString(), "2026-09-25T07:00:00.000Z");
  assert.equal(nextRetryAt(2, failedAt, [1, 6, 24])?.toISOString(), "2026-09-25T12:00:00.000Z");
  assert.equal(nextRetryAt(3, failedAt, [1, 6, 24])?.toISOString(), "2026-09-26T06:00:00.000Z");
  // The fourth consecutive failure has no rung left: the plan stops.
  assert.equal(nextRetryAt(4, failedAt, [1, 6, 24]), null);
});

test("Stripe cadence mapping stays total even though only MONTHLY reaches Stripe", () => {
  assert.deepEqual(stripeRecurringFor("MONTHLY"), { interval: "month", interval_count: 1 });
  assert.deepEqual(stripeRecurringFor("DAILY"), { interval: "day", interval_count: 1 });
  assert.deepEqual(stripeRecurringFor("FRIDAY"), { interval: "week", interval_count: 1 });
});

test("the consent snapshot records exactly what the donor was shown, and the rail", () => {
  const now = new Date("2026-09-23T07:00:00Z");
  const snap = consentSnapshotFor({ frequency: "FRIDAY", amount: 50, currency: "USD", timezone: "Europe/Istanbul", rail: "ALBARAKA", locale: "ar", now });
  assert.equal(snap.frequency, "FRIDAY");
  assert.equal(snap.amount, 50);
  assert.equal(snap.nextChargeAt, "2026-09-25T06:00:00.000Z");
  assert.deepEqual(snap.schedule, { kind: "weekday", weekday: 5, hour: FRIDAY_CHARGE_HOUR, minute: 0 });
  assert.equal(snap.rail, "ALBARAKA");
  assert.equal(snap.acceptedAt, now.toISOString());
  assert.equal(snap.locale, "ar");
});

test("schedule choices from the browser are validated, never coerced", () => {
  assert.deepEqual(parseScheduleChoice(undefined), { ok: true, value: null });
  assert.deepEqual(parseScheduleChoice({ dayOfMonth: 15, hour: 14, minute: 30, notes: "  for my mother  " }), {
    ok: true,
    value: { hour: 14, minute: 30, dayOfMonth: 15, notes: "for my mother" },
  });
  for (const bad of [{ hour: 24, minute: 0 }, { hour: 9, minute: 60 }, { hour: 9.5, minute: 0 }, { hour: "9", minute: 0 }, { dayOfMonth: 29, hour: 9, minute: 0 }, { dayOfMonth: 0, hour: 9, minute: 0 }, "15@14:30", [1]]) {
    assert.equal(parseScheduleChoice(bad).ok, false, JSON.stringify(bad));
  }
});

test("acceptance: monthly, day 15, 14:30, Europe/Istanbul  rule, first charge, consent and every later cycle agree", () => {
  const tz = "Europe/Istanbul"; // UTC+3
  const checkout = new Date("2026-10-04T09:00:00Z"); // Sunday 4 Oct 12:00 Istanbul
  const parsed = parseScheduleChoice({ dayOfMonth: 15, hour: 14, minute: 30 });
  assert.ok(parsed.ok);
  const rule = scheduleRuleFor("MONTHLY", checkout, tz, parsed.value);
  assert.deepEqual(rule, { kind: "monthDay", day: 15, hour: 14, minute: 30 });

  // Today's checkout payment is October's gift; the first scheduled charge is 15 Nov 14:30 Istanbul.
  const first = firstChargeAfterCheckout(rule, checkout, tz);
  assert.equal(first.toISOString(), "2026-11-15T11:30:00.000Z");

  const consent = consentSnapshotFor({ frequency: "MONTHLY", amount: 25, currency: "USD", timezone: tz, rail: "ALBARAKA", locale: "ar", now: checkout, rule, notes: "x" });
  assert.deepEqual(consent.schedule, rule);
  assert.equal(consent.nextChargeAt, first.toISOString());
  assert.equal(consent.notes, "x");

  // The stored plan, as the settlement and the scheduler read it.
  const plan = { frequency: "MONTHLY", scheduleRule: JSON.parse(JSON.stringify(rule)), timezone: tz };
  assert.equal(firstChargeForPlan(plan, checkout).toISOString(), first.toISOString());
  // After the 15 Nov charge, the next is 15 Dec 14:30  the same rule.
  assert.equal(nextChargeForPlan(plan, first).toISOString(), "2026-12-15T11:30:00.000Z");
  // A charge that only succeeded on a 24h retry does not drag the cycle to the 16th.
  assert.equal(nextChargeForPlan(plan, new Date("2026-11-16T11:31:00Z")).toISOString(), "2026-12-15T11:30:00.000Z");
});

test("first charge after checkout skips the period the checkout already paid", () => {
  const tz = "Europe/Istanbul";
  // Daily at 14:30, paid at 10:00 → tomorrow 14:30, not this afternoon.
  assert.equal(firstChargeAfterCheckout({ kind: "daily", hour: 14, minute: 30 }, new Date("2026-10-05T07:00:00Z"), tz).toISOString(), "2026-10-06T11:30:00.000Z");
  // Monthly on the 15th, paid on the 20th → next month's 15th.
  assert.equal(firstChargeAfterCheckout({ kind: "monthDay", day: 15, hour: 14, minute: 30 }, new Date("2026-10-20T07:00:00Z"), tz).toISOString(), "2026-11-15T11:30:00.000Z");
  // Friday 09:00, paid on Thursday → tomorrow (a different Friday's gift).
  assert.equal(firstChargeAfterCheckout({ kind: "weekday", weekday: 5, hour: 9, minute: 0 }, new Date("2026-10-08T07:00:00Z"), tz).toISOString(), "2026-10-09T06:00:00.000Z");
  // Friday 09:00, paid on Friday at 08:00 → next Friday, not an hour later.
  assert.equal(firstChargeAfterCheckout({ kind: "weekday", weekday: 5, hour: 9, minute: 0 }, new Date("2026-10-09T05:00:00Z"), tz).toISOString(), "2026-10-16T06:00:00.000Z");
});

test("rule-based next charge: daily time across DST, month-end clamp", () => {
  // New York daily at 14:30 across the March DST change keeps 14:30 local.
  const ny = nextChargeFromRule({ kind: "daily", hour: 14, minute: 30 }, new Date("2026-03-07T19:30:00Z"), "America/New_York");
  const w = wallClock(ny, "America/New_York");
  assert.deepEqual([w.month, w.day, w.hour, w.minute], [3, 8, 14, 30]);
  // A legacy monthDay of 31 still charges on February's last day.
  const feb = wallClock(nextChargeFromRule({ kind: "monthDay", day: 31, hour: 9, minute: 0 }, new Date("2026-02-01T00:00:00Z"), "UTC"), "UTC");
  assert.deepEqual([feb.month, feb.day, feb.hour], [2, 28, 9]);
});

test("legacy plans without a stored time keep their old cadence", () => {
  const tz = "Europe/Istanbul";
  const from = new Date("2026-10-05T07:12:00Z");
  const cases = [
    ["DAILY", { kind: "daily" }],
    ["MONTHLY", { kind: "monthDay", day: 5 }],
    ["MONTHLY", null],
    // A rule that does not match the plan's cadence is ignored.
    ["DAILY", { kind: "monthDay", day: 5, hour: 9 }],
  ] as const;
  for (const [frequency, scheduleRule] of cases) {
    assert.equal(nextChargeForPlan({ frequency, scheduleRule, timezone: tz }, from).toISOString(), nextChargeAt(frequency, from, tz).toISOString(), JSON.stringify(scheduleRule));
  }
  assert.equal(parseScheduleRule({ kind: "weekday", weekday: 5, hour: 9 })?.kind, "weekday");
  assert.equal(parseScheduleRule({ kind: "prayer" }), null);
});
