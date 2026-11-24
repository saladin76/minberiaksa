import test from "node:test";
import assert from "node:assert/strict";
import { parseRamadanRule, ramadanDate, prayerTimesUtc, ramadanChargeAt, nextRamadanCharge, splitAmount, ramadanTotal, ZONE_CITIES, type RamadanRule } from "../../lib/donations/ramadan-schedule";

const IST = ZONE_CITIES["Europe/Istanbul"], RUH = ZONE_CITIES["Asia/Riyadh"];
const local = (d: Date, offsetH: number) => { const t = new Date(d.getTime() + offsetH * 3_600_000); return t.getUTCHours() * 60 + t.getUTCMinutes(); };

test("rules are validated strictly", () => {
  const ok = parseRamadanRule({ kind: "ramadan", hijriYear: 1448, slot: "maghrib", lat: IST.lat, lng: IST.lng, days: [{ day: 27, amount: 300 }, { day: 5, amount: 50 }] });
  assert.deepEqual(ok?.days.map((d) => d.day), [5, 27], "sorted by day");
  for (const bad of [{ kind: "ramadan", hijriYear: 1448, slot: "noon", lat: 0, lng: 0, days: [{ day: 1, amount: 1 }] },
    { kind: "ramadan", hijriYear: 1448, slot: "fajr", lat: 0, lng: 0, days: [{ day: 31, amount: 1 }] },
    { kind: "ramadan", hijriYear: 1448, slot: "fajr", lat: 0, lng: 0, days: [{ day: 3, amount: 1 }, { day: 3, amount: 2 }] },
    { kind: "ramadan", hijriYear: 1448, slot: "fajr", lat: 0, lng: 0, days: [] }])
    assert.equal(parseRamadanRule(bad), null);
});

test("Ramadan days map to dates from the dashboard's 1 Ramadan, across months", () => {
  assert.equal(ramadanDate("2027-02-08", 1), "2027-02-08");
  assert.equal(ramadanDate("2027-02-08", 22), "2027-03-01");
  assert.equal(ramadanDate("2027-02-08", 30), "2027-03-09");
});

test("Fajr and Maghrib land where the published timetables put them", () => {
  // Turkey keeps UTC+3 all year, so its winter clock runs late against the sun.
  const ist = prayerTimesUtc("2027-02-08", IST.lat, IST.lng)!; // UTC+3
  assert.ok(local(ist.fajr, 3) >= 6 * 60 + 15 && local(ist.fajr, 3) <= 6 * 60 + 50, "Istanbul Fajr ≈ 06:34");
  assert.ok(local(ist.maghrib, 3) >= 18 * 60 + 15 && local(ist.maghrib, 3) <= 18 * 60 + 45, "Istanbul Maghrib ≈ 18:29");
  const istEnd = prayerTimesUtc("2027-03-09", IST.lat, IST.lng)!;
  assert.ok(local(istEnd.maghrib, 3) >= 18 * 60 + 50 && local(istEnd.maghrib, 3) <= 19 * 60 + 15, "Istanbul iftar early March ≈ 19:03");
  const ruh = prayerTimesUtc("2027-02-08", RUH.lat, RUH.lng)!; // UTC+3
  assert.ok(local(ruh.fajr, 3) >= 5 * 60 && local(ruh.fajr, 3) <= 5 * 60 + 30, "Riyadh Fajr ≈ 05:14");
  assert.ok(local(ruh.maghrib, 3) >= 17 * 60 + 30 && local(ruh.maghrib, 3) <= 18 * 60, "Riyadh Maghrib ≈ 17:42");
});

test("charges come after Fajr / before Maghrib, in order, and stop after the last day", () => {
  const rule = parseRamadanRule({ kind: "ramadan", hijriYear: 1448, slot: "maghrib", lat: IST.lat, lng: IST.lng, days: [{ day: 1, amount: 50 }, { day: 27, amount: 300 }] }) as RamadanRule;
  const t = prayerTimesUtc("2027-02-08", IST.lat, IST.lng)!;
  assert.equal(ramadanChargeAt(rule, "2027-02-08", 1).getTime(), t.maghrib.getTime() - 45 * 60_000);
  const first = nextRamadanCharge(rule, "2027-02-08", new Date("2027-01-01T00:00:00Z"))!;
  assert.deepEqual([first.day, first.amount], [1, 50]);
  const second = nextRamadanCharge(rule, "2027-02-08", first.at)!;
  assert.deepEqual([second.day, second.amount], [27, 300]);
  assert.equal(nextRamadanCharge(rule, "2027-02-08", second.at), null, "plan complete");
  const moved = nextRamadanCharge(rule, "2027-02-09", new Date("2027-01-01T00:00:00Z"))!;
  assert.equal(moved.at.toISOString().slice(0, 10), "2027-02-09", "a later 1 Ramadan moves every plan");
});

test("a day's amount splits over projects to the cent", () => {
  assert.deepEqual(splitAmount(100, 3), [33.34, 33.33, 33.33]);
  assert.equal(splitAmount(75, 4).reduce((a, b) => a + b, 0), 75);
  assert.equal(ramadanTotal({ days: [{ day: 1, amount: 50 }, { day: 27, amount: 300 }] }), 350);
});
