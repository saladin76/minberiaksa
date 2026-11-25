import test from "node:test";
import assert from "node:assert/strict";
import { ramadanAdvance } from "../../lib/donations/ramadan-billing";
import { ramadanChargeAt, parseRamadanRule } from "../../lib/donations/ramadan-schedule";

const rule = { kind: "ramadan", hijriYear: 1448, slot: "maghrib", lat: 41.0082, lng: 28.9784, days: [{ day: 1, amount: 50 }, { day: 27, amount: 300 }], projectIds: ["a1", "b2", "c3"] };

test("after day 1 is paid, the plan moves to day 27 with its own amount split over the projects", () => {
  const paidAt = ramadanChargeAt(parseRamadanRule(rule)!, "2027-02-08", 1);
  const r = ramadanAdvance(rule, "2027-02-08", [], new Date(paidAt.getTime() + 60_000));
  assert.equal(r.done, false);
  if (r.done) return;
  assert.equal(r.amount, 300);
  assert.equal(r.nextBillingDate.toISOString().slice(0, 10), "2027-03-06");
  assert.deepEqual(r.items, [{ campaignId: "a1", amount: 100 }, { campaignId: "b2", amount: 100 }, { campaignId: "c3", amount: 100 }]);
});

test("after the last chosen day the plan closes; a broken rule closes rather than charging monthly", () => {
  const paidAt = ramadanChargeAt(parseRamadanRule(rule)!, "2027-02-08", 27);
  assert.deepEqual(ramadanAdvance(rule, "2027-02-08", [], new Date(paidAt.getTime() + 60_000)), { done: true, nextBillingDate: null });
  assert.deepEqual(ramadanAdvance({ kind: "monthDay", day: 1 }, "2027-02-08", ["x"], new Date()), { done: true, nextBillingDate: null });
});

test("a later 1 Ramadan (moon sighting) moves the next charge; plans without stored projects keep their items", () => {
  const r = ramadanAdvance({ ...rule, projectIds: undefined }, "2027-02-09", ["only"], new Date("2027-01-01T00:00:00Z"));
  assert.ok(!r.done && r.nextBillingDate.toISOString().slice(0, 10) === "2027-02-09" && r.items.length === 1 && r.items[0].amount === 50);
});

test("1 Ramadan is read from the stored settings, falling back to the default when malformed", async () => {
  const { ramadanStartDateFrom } = await import("../../lib/donations/ramadan-billing");
  assert.equal(ramadanStartDateFrom({ startDate: "2027-02-09" }), "2027-02-09");
  assert.equal(ramadanStartDateFrom({ startDate: "2027-02-30" }), "2027-02-08");
  assert.equal(ramadanStartDateFrom(null), "2027-02-08");
});
