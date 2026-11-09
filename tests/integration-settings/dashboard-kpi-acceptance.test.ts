import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getIstanbulDateRange } from "../../lib/admin/istanbul-calendar";
import { summarizeScopedDonationChart } from "../../lib/dashboard/donation-chart-filter-scope";
import { SUPPORTED_LOCALES } from "../../lib/locales";

const page = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const chartRoute = readFileSync("app/api/admin/donations/chart/route.ts", "utf8");
const chartScope = readFileSync("lib/dashboard/donation-chart-filter-scope.ts", "utf8");
const exportRoute = readFileSync("app/api/admin/donations/export/route.ts", "utf8");
const exportBuilder = readFileSync("lib/dashboard/donation-export.ts", "utf8");
const exportDialog = readFileSync("components/dashboard/ExportReportDialog.tsx", "utf8");
const summary = readFileSync("components/dashboard/HomeDonationSummary.tsx", "utf8");

test("chart and export paths include the selected filter dimensions", () => {
  for (const filter of ["categoryId", "campaignId", "locale", "country", "provider", "status", "donationType"]) {
    assert.ok(
      page.includes(`params.set("${filter}",`) || page.includes(`params.append("${filter}",`),
      `Dashboard chart request omits ${filter}`,
    );
  }
  assert.match(page, /params\.append\("userId",/);
  for (const filter of ["categoryId", "campaignId", "userId", "locale", "country", "provider", "status", "donationType"]) {
    assert.ok(exportRoute.includes(filter), `Export route omits ${filter}`);
  }
  assert.match(chartRoute, /resolveDonationRelationFilterIds/);
  assert.match(chartRoute, /donationChartStatusWhere\(/);
  assert.match(chartRoute, /donationChartTypeWhere\(/);
});

test("Istanbul day fixture exposes settlement-date versus export-created-date mismatch", () => {
  const { startDate, endDate } = getIstanbulDateRange("day", "2026-11-01", "2026-11-01");
  assert.equal(startDate.toISOString(), "2026-10-31T21:00:00.000Z");
  assert.equal(endDate.toISOString(), "2026-11-01T20:59:59.999Z");

  const row = {
    createdAt: new Date("2026-10-31T20:30:00.000Z"),
    paidAt: new Date("2026-10-31T21:30:00.000Z"),
  };
  assert.ok(row.paidAt >= startDate && row.paidAt <= endDate);
  assert.ok(!(row.createdAt >= startDate && row.createdAt <= endDate));
  assert.match(chartScope, /status: "PAID", paidAt: \{ gte: startDate, lte: endDate \}/);
  assert.match(exportRoute, /createdAt: dateFilter/);

  // The export dialog's presets derive date keys from UTC, not the dashboard's Istanbul range.
  assert.match(exportDialog, /start\.toISOString\(\)\.slice\(0, 10\)/);
});

test("fixtures capture failed-amount and zero-total team-support export divergences", () => {
  const failed = { amountUSD: null, amount: 42, currency: "USD" };
  const chartFailedUsd = failed.amountUSD ?? (failed.currency === "USD" ? failed.amount : 0);
  const exportedFailedUsd = failed.amountUSD ?? 0;
  assert.equal(chartFailedUsd, 42);
  assert.equal(exportedFailedUsd, 0);
  assert.match(chartRoute, /donationRowUsdApprox\(d\)/);
  assert.match(exportBuilder, /failedAmountUSD \+= r\.amountUSD \?\? 0/);

  const support = { amountUSD: 100, amount: 80, teamSupport: 20, fees: 0, totalAmount: 0 };
  const chartSupportUsd = support.totalAmount > 0
    ? support.amountUSD * (support.teamSupport / support.totalAmount)
    : 0;
  const exportDenominator = support.totalAmount || support.amount + support.teamSupport + support.fees;
  const exportedSupportUsd = (support.teamSupport / exportDenominator) * support.amountUSD;
  assert.equal(chartSupportUsd, 0);
  assert.equal(exportedSupportUsd, 20);
  assert.match(chartRoute, /if \(localTotal > 0\)/);
  assert.match(exportBuilder, /r\.totalAmount \|\| r\.amount \+ r\.teamSupport \+ r\.fees/);
});

test("empty chart fixtures stay numeric and stale chart responses cannot replace newer filters", () => {
  const empty = summarizeScopedDonationChart([]);
  assert.equal(empty.paidAmountUSD, 0);
  assert.equal(empty.paidCount, 0);
  assert.equal(empty.failedCount, 0);
  assert.equal(empty.pendingCount, 0);
  assert.match(page, /const chartRequestId = useRef\(0\)/);
  assert.match(page, /if \(requestId !== chartRequestId\.current\) return/);
  assert.match(page, /setChartData\(\[\]\); \/\/ Never show stale amounts/);
});

test("all 19 public locale names and KPI responsive/accessibility markup are available", () => {
  assert.equal(SUPPORTED_LOCALES.length, 19);
  const names = SUPPORTED_LOCALES.map((locale) =>
    new Intl.DisplayNames([locale], { type: "language" }).of(locale),
  );
  assert.ok(names.every((name) => Boolean(name)));

  assert.match(summary, /aria-label=\{dt\("المؤشرات"\)\}/);
  assert.match(summary, /aria-busy=\{loading\}/);
  assert.match(summary, /<article[^>]+aria-label=\{card\.title\}/);
  assert.match(summary, /grid-cols-1[^"]*(?:sm:|min-\[420px\]:)/);
  assert.match(summary, /dir="ltr"/);
});

test("export applies donation type but omits it from the report filter descriptors", () => {
  const descriptorBuilder = exportRoute.slice(exportRoute.indexOf("function collectFilterDescriptors"));
  assert.match(exportRoute, /donationType === "ONE_TIME"/);
  assert.match(exportRoute, /donationType === "MONTHLY"/);
  assert.doesNotMatch(descriptorBuilder, /donationType/);
});
