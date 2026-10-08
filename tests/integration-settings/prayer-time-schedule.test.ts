import test from "node:test";
import assert from "node:assert/strict";
import {
  firstPrayerChargeAfterCheckout,
  nextPrayerChargeFromRule,
  nextChargeForStoredPlan,
  prayerTimeForDate,
  firstChargeForSettledPlan,
} from "../../lib/donations/prayer-time-schedule";
import { parseScheduleChoice, parseScheduleRule, scheduleRuleFor, firstChargeAfterCheckout } from "../../lib/donations/recurring-schedule";

const rule = { kind: "prayer", weekday: 5, prayer: "Dhuhr", latitude: 41.0082, longitude: 28.9784, method: 13, minutesBefore: 30 } as const;
const fake: typeof fetch = async (url) => {
  const u = new URL(String(url));
  assert.equal(u.hostname, "api.aladhan.com");
  assert.equal(u.searchParams.get("method"), "13");
  assert.equal(u.searchParams.get("latitude"), String(rule.latitude));
  return new Response(JSON.stringify({ code: 200, data: { timings: { Dhuhr: "13:15 (+03)" }, meta: { timezone: u.searchParams.get("timezonestring") } } }), { status: 200 });
};
test("Friday Dhuhr choice parses as structured rule; invalid location/method fails closed", () => {
  const parsed = parseScheduleChoice({ mode: "prayer", prayer: "Dhuhr", latitude: rule.latitude, longitude: rule.longitude });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const saved = scheduleRuleFor("FRIDAY", new Date("2026-10-08T07:00:00Z"), "Europe/Istanbul", parsed.value);
  assert.deepEqual(saved, rule);
  assert.deepEqual(parseScheduleRule(saved), rule);
  for (const invalid of [{ mode: "prayer", prayer: "Fajr", latitude: 41, longitude: 29 }, { mode: "prayer", prayer: "Dhuhr" }, { mode: "prayer", prayer: "Dhuhr", latitude: 92, longitude: 29 }, { mode: "prayer", prayer: "Dhuhr", latitude: 41, longitude: 29, hour: 9 }]) {
    assert.equal(parseScheduleChoice(invalid).ok, false);
  }
  assert.equal(parseScheduleRule({ ...rule, method: 1 }), null);
  assert.throws(() => scheduleRuleFor("MONTHLY", new Date(), "UTC", { mode: "prayer", prayer: "Dhuhr", latitude: 41, longitude: 29 }), /PRAYER_FREQUENCY_MISMATCH/);
  assert.throws(() => firstChargeAfterCheckout(rule, new Date(), "Europe/Istanbul"), /ASYNC_RESOLUTION/);
});
test("Friday prayer payment = 30min before calculated Dhuhr; same-day paid checkout skips the week", async () => {
  const thursday = new Date("2026-10-08T07:00:00Z");
  const expected = "2026-10-09T09:45:00.000Z"; // 12:45 Istanbul
  assert.equal((await nextPrayerChargeFromRule(rule, thursday, "Europe/Istanbul", fake)).toISOString(), expected);
  assert.equal((await firstPrayerChargeAfterCheckout(rule, thursday, "Europe/Istanbul", fake)).toISOString(), expected);
  const fridayEarly = new Date("2026-10-09T06:00:00Z");
  assert.equal((await firstPrayerChargeAfterCheckout(rule, fridayEarly, "Europe/Istanbul", fake)).toISOString(), "2026-10-16T09:45:00.000Z");
  assert.equal((await nextChargeForStoredPlan({ frequency: "FRIDAY", timezone: "Europe/Istanbul", scheduleRule: rule }, new Date(expected), fake)).toISOString(), "2026-10-16T09:45:00.000Z");
});
test("prayer time fail-closed on provider errors, timezone mismatch, corrupt saved rules", async () => {
  const badFetch: typeof fetch = async () => new Response("bad", { status: 503 });
  await assert.rejects(() => nextPrayerChargeFromRule(rule, new Date(), "Europe/Istanbul", badFetch), /PROVIDER_UNAVAILABLE/);
  await assert.rejects(() => nextPrayerChargeFromRule(rule, new Date(), "Not/AZone", fake), /PRAYER_TIMEZONE_REQUIRED/);
  await assert.rejects(() => nextChargeForStoredPlan({ frequency: "FRIDAY", timezone: "Europe/Istanbul", scheduleRule: { kind: "prayer", prayer: "Fajr" } }, new Date(), fake), /PRAYER_RULE_INVALID/);
  const badZone: typeof fetch = async () => new Response(JSON.stringify({ code: 200, data: { timings: { Dhuhr: "13:15" }, meta: { timezone: "Asia/Tokyo" } } }), { status: 200 });
  await assert.rejects(() => prayerTimeForDate(new Date("2026-10-09T00:00:00Z"), rule, "Europe/Istanbul", badZone), /TIMEZONE_MISMATCH/);
});
test("fixed-time recurring dates remain backward compatible", async () => {
  const now = new Date("2026-10-08T07:00:00Z");
  assert.equal((await nextChargeForStoredPlan({ frequency: "MONTHLY", timezone: "Europe/Istanbul", scheduleRule: { kind: "monthDay", day: 15, hour: 14, minute: 30 } }, now, fake)).toISOString(), "2026-10-15T11:30:00.000Z");
});

test("first instalment settlement never calls prayer provider and does not bill the same Friday twice", () => {
  const pending = new Date("2026-10-09T09:45:00.000Z");
  const plan = { frequency: "FRIDAY", timezone: "Europe/Istanbul", scheduleRule: rule, nextBillingDate: pending };
  assert.equal(firstChargeForSettledPlan(plan, new Date("2026-10-08T08:00:00Z"))?.toISOString(), pending.toISOString());
  assert.equal(firstChargeForSettledPlan(plan, new Date("2026-10-09T07:00:00Z"))?.toISOString(), "2026-10-16T09:45:00.000Z");
  assert.equal(firstChargeForSettledPlan(plan, new Date("2026-10-09T10:00:00Z"))?.toISOString(), "2026-10-16T09:45:00.000Z");
  assert.equal(firstChargeForSettledPlan({ ...plan, nextBillingDate: null }, new Date()), null);
  assert.equal(firstChargeForSettledPlan({ ...plan, timezone: "Invalid/Timezone" }, new Date()), null);
});
