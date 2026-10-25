import assert from "node:assert/strict";
import test from "node:test";
import { calendarAmountUSD, calendarDay, calendarOccurrences, emptyCalendar, recurringCalendarMonth } from "../../lib/dashboard/recurring-calendar";
const october = recurringCalendarMonth("2026-10")!;
test("selected Istanbul calendar month validates dates and leap years", () => {
  assert.equal(recurringCalendarMonth("2026-13"), null);
  assert.equal(recurringCalendarMonth("2026-2"), null);
  assert.equal(recurringCalendarMonth("2028-02")?.days, 29);
  assert.equal(emptyCalendar(recurringCalendarMonth("2026-02")!).length, 28);
  assert.equal(recurringCalendarMonth(undefined, new Date("2026-10-31T22:00:00Z"))?.month, "2026-11");
  assert.equal(calendarDay("2026-09-30T21:00:00Z", october), 1);
  assert.equal(calendarDay("2026-10-31T21:00:00Z", october), null);
  assert.equal(calendarDay("invalid", october), null);
});
test("daily renewals start at authoritative next date, excluding the first gift and earlier dates", () => {
  const plan = { frequency: "DAILY", timezone: "Europe/Istanbul", nextBillingDate: "2026-10-26T11:30:00Z", scheduleRule: { kind: "daily", hour: 14, minute: 30 } };
  assert.deepEqual(calendarOccurrences(plan, october)?.map(date => calendarDay(date, october)), [26,27,28,29,30,31]);
  assert.equal(calendarOccurrences(plan, recurringCalendarMonth("2026-11")!)?.length, 30);
  assert.equal(calendarOccurrences(plan, recurringCalendarMonth("2026-09")!)?.length, 0);
});
test("Friday renewals occupy the actual Fridays of the selected month", () => {
  const month = recurringCalendarMonth("2026-11")!;
  const dates = calendarOccurrences({ frequency: "FRIDAY", timezone: "Europe/Istanbul", nextBillingDate: "2026-10-30T06:00:00Z", scheduleRule: { kind: "weekday", weekday: 5, hour: 9, minute: 0 } }, month)!;
  assert.deepEqual(dates.map(date => calendarDay(date, month)), [6,13,20,27]);
});
test("monthly projections follow the same month-end clamping as the collector", () => {
  const plan = { frequency: "MONTHLY", timezone: "Europe/Istanbul", nextBillingDate: "2028-01-31T11:30:00Z", scheduleRule: { kind: "monthDay", day: 31, hour: 14, minute: 30 } };
  const february = recurringCalendarMonth("2028-02")!;
  assert.deepEqual(calendarOccurrences(plan, february)?.map(date => calendarDay(date, february)), [29]);
  const march = recurringCalendarMonth("2028-03")!;
  assert.deepEqual(calendarOccurrences(plan, march)?.map(date => calendarDay(date, march)), [31]);
  // Legacy frequency-only plans deliberately keep the collector's older clamping.
  assert.deepEqual(calendarOccurrences({ ...plan, scheduleRule: null }, march)?.map(date => calendarDay(date, march)), [29]);
});
test("calendar projection retains a donor timezone across DST", () => {
  const plan = { frequency: "DAILY", timezone: "America/New_York", nextBillingDate: "2026-10-31T13:00:00Z", scheduleRule: { kind: "daily", hour: 9, minute: 0 } };
  const dates = calendarOccurrences(plan, recurringCalendarMonth("2026-11")!)!;
  assert.equal(dates.length, 30);
  assert.equal(dates[0].toISOString(), "2026-11-01T14:00:00.000Z");
});
test("missing schedules are reported and foreign amounts never silently treated as USD", () => {
  assert.equal(calendarOccurrences({ frequency: "DAILY", nextBillingDate: null }, october), null);
  assert.equal(calendarOccurrences({ frequency: "DAILY", nextBillingDate: "invalid" }, october), null);
  assert.equal(calendarAmountUSD({ amount: 50, currency: "TRY" }), null);
  assert.equal(calendarAmountUSD({ amount: 50, currency: "TRY", amountUSD: 1 }), 1);
  assert.equal(calendarAmountUSD({ amount: 1, totalAmount: 2, currency: "USD" }), 2);
  assert.equal(calendarAmountUSD({ amount: 1, currency: "USD", amountUSD: 0 }), 0);
});

test("legacy rules without a chosen hour retain the collector wall time and month day", () => {
  const month = recurringCalendarMonth("2026-11")!;
  const monthly = calendarOccurrences({ frequency: "MONTHLY", timezone: "Europe/Istanbul", nextBillingDate: "2026-10-15T11:30:00Z", scheduleRule: { kind: "monthDay", day: 15 } }, month)!;
  assert.deepEqual(monthly.map(date => date.toISOString()), ["2026-11-15T11:30:00.000Z"]);
  const daily = calendarOccurrences({ frequency: "DAILY", timezone: "Europe/Istanbul", nextBillingDate: "2026-10-26T11:30:00Z", scheduleRule: { kind: "daily" } }, month)!;
  assert.equal(daily.length, 30);
  assert.equal(daily[0].toISOString(), "2026-11-01T11:30:00.000Z");
});
