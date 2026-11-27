import test from "node:test";
import assert from "node:assert/strict";
import { buildRamadanPlan, placeForTimezone } from "../../lib/donations/ramadan-plan";
import { prayerTimesUtc } from "../../lib/donations/ramadan-schedule";
import { nextChargeAfterPayment, normalizeTimezone } from "../../lib/donations/recurring-schedule";

const settings = { enabled: true, hijriYear: 1448, startDate: "2027-02-08", projectIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"] };
const now = new Date("2027-01-01T00:00:00Z");
const local = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// [zone, a city of that zone (lat, lng)] — zones NOT in the Arabic city list included on purpose.
const donors: [string, number, number][] = [
  ["Asia/Kuala_Lumpur", 3.139, 101.687], ["Asia/Baku", 40.409, 49.867], ["Asia/Karachi", 24.861, 67.01],
  ["Europe/Madrid", 40.417, -3.704], ["Europe/Prague", 50.076, 14.438], ["Africa/El_Aaiun", 27.125, -13.162],
  ["Asia/Jakarta", -6.2, 106.817], ["America/Chicago", 41.878, -87.63], ["Australia/Sydney", -33.869, 151.209],
  ["Asia/Riyadh", 24.714, 46.675], ["Europe/London", 51.507, -0.128], ["America/New_York", 40.713, -74.006],
];

for (const [tz, lat, lng] of donors) {
  for (const slot of ["fajr", "maghrib"] as const) {
    test(`${tz} · ${slot}: charged by the donor's own ${slot}, in their own local time`, () => {
      const built = buildRamadanPlan({ days: [{ day: 1, amount: 5 }], slot, timezone: tz, projectIds: settings.projectIds, intent: "self", remind: false }, settings, now);
      assert.ok(built.ok);
      if (!built.ok) return;
      const t = prayerTimesUtc("2027-02-08", lat, lng)!;
      const at = built.first.at.getTime();
      if (slot === "fajr") {
        assert.ok(at > t.fajr.getTime(), `${tz}: charge ${local(built.first.at, tz)} must be after local Fajr ${local(t.fajr, tz)}`);
        assert.ok(at - t.fajr.getTime() < 90 * 60_000, `${tz}: charge ${local(built.first.at, tz)} too late after Fajr ${local(t.fajr, tz)}`);
      } else {
        assert.ok(at < t.maghrib.getTime(), `${tz}: charge ${local(built.first.at, tz)} must be before local Maghrib ${local(t.maghrib, tz)}`);
        assert.ok(t.maghrib.getTime() - at < 90 * 60_000, `${tz}: charge ${local(built.first.at, tz)} too early before Maghrib ${local(t.maghrib, tz)}`);
      }
      // a sanity bound in the donor's own clock: Fajr charges in the early morning, Maghrib ones late afternoon/evening
      const m = mins(local(built.first.at, tz));
      if (slot === "fajr") assert.ok(m >= 3 * 60 && m <= 8 * 60, `${tz} fajr at ${local(built.first.at, tz)}`);
      else assert.ok(m >= 15 * 60 && m <= 21 * 60, `${tz} maghrib at ${local(built.first.at, tz)}`);
    });
  }
}

test("only a zone with no information falls back to Istanbul; offset zones use their meridian", () => {
  assert.deepEqual(placeForTimezone("UTC"), { lat: 41.0082, lng: 28.9784 });
  assert.equal(placeForTimezone("Etc/GMT-3").lng, 45);
  assert.deepEqual(placeForTimezone("Asia/Calcutta"), placeForTimezone("Asia/Kolkata"));
  assert.notDeepEqual(placeForTimezone("Asia/Kuala_Lumpur"), placeForTimezone("Europe/Istanbul"));
});

test("Friday plans: charged on Friday at the chosen hour in the donor's own zone", () => {
  for (const tz of ["Asia/Baku", "America/New_York", "Asia/Kuala_Lumpur", "Europe/Istanbul"]) {
    const plan = { frequency: "FRIDAY", timezone: normalizeTimezone(tz), scheduleRule: { kind: "weekday", weekday: 5, hour: 9, minute: 0 } };
    const next = nextChargeAfterPayment(plan as never, new Date("2026-11-27T12:00:00Z")) as Date;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(next);
    assert.equal(parts, "Fri 09:00", `${tz}: ${parts}`);
  }
});
