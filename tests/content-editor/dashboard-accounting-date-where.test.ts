import assert from "node:assert/strict";
import test from "node:test";
import { accountingDateWhere } from "../../lib/dashboard/accounting-date-where";
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
  assert.equal(where.OR.length, 3);
  assert.equal(where.OR[0].paidAt.gte, startDate);
  assert.equal(where.OR[1].createdAt.gte, startDate);
  assert.equal(where.OR[2].createdAt.gte, startDate);
});
