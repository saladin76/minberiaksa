import assert from "node:assert/strict";
import test from "node:test";
import { accountingDateWhere, canUseAccountingDate } from "../../lib/dashboard/accounting-date-where";
import { istanbulDateKeysToUtcRange } from "../../lib/admin/istanbul-calendar";

const { startDate, endDate } = istanbulDateKeysToUtcRange("2026-11-11", "2026-11-11");

test("Istanbul accounting window spans local midnight, not UTC midnight", () => {
  assert.equal(startDate.toISOString(), "2026-11-10T21:00:00.000Z");
  assert.equal(endDate.toISOString(), "2026-11-11T20:59:59.999Z");
});

test("settled donations are filtered by paidAt, not createdAt", () => {
  assert.deepEqual(accountingDateWhere("PAID", startDate, endDate), {
    status: "PAID", paidAt: { gte: startDate, lte: endDate },
  });
});

test("failed attempts are filtered by creation time", () => {
  assert.deepEqual(accountingDateWhere("FAILED", startDate, endDate), {
    status: "FAILED", createdAt: { gte: startDate, lte: endDate },
  });
});

test("pending attempts have createdAt window and no settled paidAt", () => {
  assert.deepEqual(accountingDateWhere("PENDING", startDate, endDate), {
    status: "PAID",
    createdAt: { gte: startDate, lte: endDate },
    OR: [{ paidAt: null }, { paidAt: { isSet: false } }],
  });
});

test("resolved includes paid settlement and failed attempts, never pending", () => {
  const where = accountingDateWhere("RESOLVED", startDate, endDate);
  assert.deepEqual(where, {
    OR: [
      { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      { status: "FAILED", createdAt: { gte: startDate, lte: endDate } },
    ],
  });
});

test("all includes paid settlement, failed, and pending attempt arms", () => {
  const where = accountingDateWhere("all", startDate, endDate);
  assert.deepEqual(where, {
    OR: [
      { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      { status: "FAILED", createdAt: { gte: startDate, lte: endDate } },
      {
        status: "PAID",
        createdAt: { gte: startDate, lte: endDate },
        OR: [{ paidAt: null }, { paidAt: { isSet: false } }],
      },
    ],
  });
});

test("accounting calendar is limited to authorized revenue viewers and complete ranges", () => {
  const allowed = { revenueAuthorized: true, dateBasis: "accounting", start: "2026-11-10", end: "2026-11-11" };
  assert.equal(canUseAccountingDate(allowed), true);
  assert.equal(canUseAccountingDate({ ...allowed, revenueAuthorized: false }), false);
  assert.equal(canUseAccountingDate({ ...allowed, dateBasis: null }), false);
  assert.equal(canUseAccountingDate({ ...allowed, dateBasis: "created" }), false);
  assert.equal(canUseAccountingDate({ ...allowed, start: null }), false);
  assert.equal(canUseAccountingDate({ ...allowed, end: null }), false);
});
