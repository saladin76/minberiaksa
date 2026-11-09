import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  donationChartStatusWhere,
  donationChartTypeWhere,
  summarizeScopedDonationChart,
} from "../../lib/dashboard/donation-chart-filter-scope";

const start = new Date("2026-11-01T00:00:00.000Z");
const end = new Date("2026-11-08T20:59:59.999Z");

test("period status uses paidAt for confirmed revenue and createdAt for failed/pending attempts", () => {
  assert.deepEqual(donationChartStatusWhere("PAID", start, end), {
    status: "PAID", paidAt: { gte: start, lte: end },
  });
  assert.deepEqual(donationChartStatusWhere("FAILED", start, end), {
    status: "FAILED", createdAt: { gte: start, lte: end },
  });
  assert.deepEqual(donationChartStatusWhere("PENDING", start, end), {
    status: "PAID", createdAt: { gte: start, lte: end },
    OR: [{ paidAt: null }, { paidAt: { isSet: false } }],
  });
  const resolved = donationChartStatusWhere("RESOLVED", start, end);
  assert.equal("OR" in resolved && resolved.OR?.length, 2);
  const all = donationChartStatusWhere("all", start, end);
  assert.equal("OR" in all && all.OR?.length, 3);
});

test("donation type filtering accepts MongoDB missing subscriptionId", () => {
  assert.deepEqual(donationChartTypeWhere("ONE_TIME"), {
    OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }],
  });
  assert.deepEqual(donationChartTypeWhere("MONTHLY"), { subscriptionId: { not: null } });
  assert.equal(donationChartTypeWhere("all"), null);
});

test("filtered-period revenue does not mix failed or pending attempts with collected income", () => {
  const result = summarizeScopedDonationChart([
    { amountUSD: 100, count: 2, amountOneTime: 75, countOneTime: 1,
      amountMonthly: 25, countMonthly: 1, amountFailed: 120, countFailed: 3,
      countPending: 2, teamSupport: 5, fees: 2 },
    { amountUSD: 10, count: 1, amountOneTime: 10, countOneTime: 1,
      amountFailed: 500, countFailed: 1, countPending: 4 },
  ]);
  assert.equal(result.paidAmountUSD, 110);
  assert.equal(result.paidCount, 3);
  assert.equal(result.failedCount, 4);
  assert.equal(result.pendingCount, 6);
  assert.equal(result.oneTimeAmountUSD + result.recurringAmountUSD, 110);
  assert.equal(result.attemptedFailedAmountUSD, 620);
});

test("dashboard uses filter-scoped primary KPI cards with no duplicate period summary", () => {
  const page = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  const chart = readFileSync("app/api/admin/donations/chart/route.ts", "utf8");
  const cards = readFileSync("components/dashboard/HomeDonationSummary.tsx", "utf8");
  assert.match(page, /params\.set\("status", donationsStatusFilter\)/);
  assert.match(page, /params\.set\("donationType", donationsTypeFilter\)/);
  for (const filter of ["categoryId", "campaignId", "locale", "country", "provider"]) {
    assert.ok(page.includes(`params.set("${filter}",`) || page.includes(`params.append("${filter}",`), `Missing chart scope: ${filter}`);
  }
  assert.match(page, /params\.append\("userId",/);
  assert.match(page, /\[selectedCategory, selectedCampaign, selectedUserId, searchParams, chartPeriod,/);

  assert.match(page, /summarizeScopedDonationChart\(chartData\)/);
  assert.match(page, /<HomeDonationSummary[\s\S]*?scoped=\{scoped\}/);
  assert.doesNotMatch(page, /نتائج الفترة المحددة|<MetricSummaryBand/);
  assert.doesNotMatch(cards, /\/api\/admin\/dashboard-summary|\/api\/admin\/bank-transfers\/summary/);
  assert.match(cards, /scoped\.paidAmountUSD/);
  assert.match(cards, /scoped\.oneTimeAmountUSD/);
  assert.match(cards, /scoped\.recurringAmountUSD/);
  assert.match(cards, /scoped\.failedCount/);
  assert.match(cards, /scoped\.pendingCount/);
  assert.match(chart, /donationChartStatusWhere\(/);
  assert.match(chart, /donationChartTypeWhere\(/);
  assert.match(chart, /countPending/);
});
