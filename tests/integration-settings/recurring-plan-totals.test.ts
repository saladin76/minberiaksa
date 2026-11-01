import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { recurringPlanTotals } from "../../lib/dashboard/recurring-plan-totals";

test("MRR combines daily, Friday and legacy monthly plans on a monthly basis while retaining the exact scope", async () => {
  const scope = { status: "ACTIVE" as const, donorId: "fixture", donations: { some: { status: "PAID" as const, paidAt: { not: null } } } };
  const seen: unknown[] = [];
  const database = { subscription: { aggregate: async (query: { where: { AND: unknown[] } }) => {
    seen.push(query.where.AND[1]); assert.equal(query.where.AND[0], scope);
    const frequency = query.where.AND[1] as { frequency?: string; OR?: unknown[] };
    if (frequency.frequency === "DAILY") return { _sum: {amountUSD: 1}, _count: {id: 1} };
    if (frequency.frequency === "FRIDAY") return { _sum: {amountUSD: 7}, _count: {id: 2} };
    assert.deepEqual(frequency.OR, [{frequency:"MONTHLY"},{frequency:{isSet:false}},{frequency:null}]);
    return { _sum: {amountUSD: 100}, _count: {id: 3} };
  } } } as unknown as Pick<PrismaClient,"subscription">;
  const result = await recurringPlanTotals(database,scope);
  assert.equal(seen.length,3);
  assert.equal(result.total.amountUSD,108);
  assert.equal(result.total.monthlyUSD,160.875);
  assert.equal(result.total.count,6);
  assert.equal(result.byFrequency.MONTHLY.monthlyUSD,100);
});
test("MRR database errors propagate instead of presenting zero as a valid amount", async () => {
  const database = { subscription: { aggregate: async () => { throw new Error("unavailable"); } } } as unknown as Pick<PrismaClient,"subscription">;
  await assert.rejects(recurringPlanTotals(database,{}),/unavailable/);
});
test("monthly scope explicitly covers legacy missing/null cadence without including daily or Friday", async () => {
  const { subscriptionFrequencyWhere } = await import("../../lib/dashboard/recurring-frequency-filter");
  const query = subscriptionFrequencyWhere("MONTHLY");
  const branches = query.OR as { frequency: unknown }[];
  const match = (row: { frequency?: string | null }) => branches.some(branch => {
    const value = branch.frequency;
    if (value && typeof value === "object" && "isSet" in value) return Object.hasOwn(row, "frequency") === value.isSet;
    return Object.hasOwn(row, "frequency") && row.frequency === value;
  });
  assert.equal(match({}), true); assert.equal(match({ frequency: null }), true); assert.equal(match({ frequency: "MONTHLY" }), true);
  assert.equal(match({ frequency: "DAILY" }), false); assert.equal(match({ frequency: "FRIDAY" }), false);
});
