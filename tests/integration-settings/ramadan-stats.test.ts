import test from "node:test";
import assert from "node:assert/strict";
import { ramadanStats } from "../../lib/minbar/ramadan-stats";

const rule = (days: [number, number][], extra: Record<string, unknown> = {}) => ({ kind: "ramadan", days: days.map(([day, amount]) => ({ day, amount })), slot: "maghrib", intent: "self", projectIds: ["a", "b"], ...extra });

test("Ramadan results: only card-confirmed active plans count as scheduled; per-day, projects, splits and collected", () => {
  const plans = [
    { id: "p1", status: "ACTIVE", hasCard: true, createdAt: new Date(), donorId: "u1", scheduleRule: rule([[1, 50], [27, 300]], { intent: "parents" }) },
    { id: "p2", status: "ACTIVE", hasCard: true, createdAt: new Date(), donorId: "u2", scheduleRule: rule([[27, 100]], { slot: "fajr", projectIds: ["a"] }) },
    { id: "p3", status: "ACTIVE", hasCard: false, createdAt: new Date(), donorId: "u3", scheduleRule: rule([[1, 999]]) },
    { id: "p4", status: "PAYMENT_FAILED", hasCard: true, createdAt: new Date(), donorId: "u4", scheduleRule: rule([[2, 20]]) },
  ];
  const s = ramadanStats(plans, [{ subscriptionId: "p1", status: "PAID", amountUSD: 50 }, { subscriptionId: "p4", status: "FAILED", amountUSD: 20 }, { subscriptionId: "x", status: "PAID", amountUSD: 1000 }]);
  assert.deepEqual([s.confirmed, s.awaitingCard, s.stopped, s.donors], [2, 1, 1, 2]);
  assert.equal(s.scheduledTotal, 450); assert.equal(s.perDay[0], 50); assert.equal(s.perDay[26], 400);
  assert.deepEqual(s.slot, { fajr: 1, maghrib: 1 }); assert.deepEqual(s.intent, { self: 1, parents: 1, other: 0 });
  assert.deepEqual(s.projects, [{ id: "a", total: 275 }, { id: "b", total: 175 }]);
  assert.equal(s.collected, 50); assert.equal(s.failedCharges, 1);
});
