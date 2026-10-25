import assert from "node:assert/strict";
import test from "node:test";
import { parseGa4Period, ga4DateRange, ga4PeriodKey } from "../../lib/marketing/ga4-period";
import { fetchGa4Extended } from "../../lib/marketing/ga4-extended";
import { analyzeGa4Report, ga4AnalysisEvidence } from "../../lib/marketing/ga4-analysis";
import { parseGa4BatchResponse } from "../../lib/marketing/ga4-reporting";
import { ga4ManagedSeoLink, ga4SeoEvidence } from "../../lib/marketing/ga4-seo";

test("today, yesterday and bounded custom periods have stable, distinct cache keys", () => {
  assert.deepEqual(ga4DateRange("today"), {startDate: "today", endDate: "today"});
  assert.deepEqual(ga4DateRange("yesterday"), {startDate: "yesterday", endDate: "yesterday"});
  const period = parseGa4Period({range: "custom", startDate: "2026-10-01", endDate: "2026-10-20"}, new Date("2026-10-25"));
  assert.deepEqual(ga4DateRange(period), {startDate: "2026-10-01", endDate: "2026-10-20"});
  for (const input of [ {range: "custom", startDate: "2026-02-30", endDate: "2026-03-01"}, {range: "custom", startDate: "2026-10-20", endDate: "2026-10-01"}, {range: "custom", startDate: "2024-01-01", endDate: "2026-10-20"}, {range: "custom", startDate: "2026-10-01", endDate: "2027-01-01"}, {range: "all"} ]) assert.throws(() => parseGa4Period(input, new Date("2026-10-25")), /GA4_PERIOD_INVALID/);
  assert.notEqual(ga4PeriodKey(period), ga4PeriodKey({...period, endDate: "2026-10-21"}));
});

test("an unavailable interest report does not erase campaigns, searches or browser data", async () => {
  const sizes: number[] = [];
  const report = await fetchGa4Extended({propertyId: "123456", accessToken: "fixture-token", range: "today", fetchImpl: async (_url, init) => {
    const {requests} = JSON.parse(String(init?.body)) as {requests: {dateRanges: {startDate: string}[]; dimensions: {name: string}[]; metrics: {name: string}[]}[]}; sizes.push(requests.length);
    assert.ok(requests.every((row) => row.dateRanges[0].startDate === "today"));
    if (requests[0].dimensions[0].name === "brandingInterest") return new Response("private provider failure", {status: 403});
    return new Response(JSON.stringify({reports: requests.map((row) => ({rowCount: 40, rows: [{dimensionValues: row.dimensions.map((x) => ({value: x.name})), metricValues: row.metrics.map(() => ({value: "10"}))}], metadata: {subjectToThresholding: true}}))}));
  }});
  assert.ok(sizes.every((size) => size <= 5)); assert.equal(report.interests?.error, "HTTP_403");
  assert.equal(report.campaigns?.rows.length, 1); assert.equal(report.siteSearch?.thresholded, true); assert.equal(report.browsers?.rowCount, 40);
  assert.ok(!JSON.stringify(report).includes("private provider failure"));
});

function fixture() {
  const report = parseGa4BatchResponse({reports: []});
  report.pages = [ {pagePath: "/ar", pageTitle: "Home", screenPageViews: 30, activeUsers: 20, sessions: 25}, {pagePath: "/ar/profile/507f1f77bcf86cd799439011?token=secret", pageTitle: "private", screenPageViews: 1, activeUsers: 1, sessions: 1} ];
  report.extended = {siteSearch: {rows: [{dimensions: ["person@example.com +905555555555"], metrics: [2,1]}], rowCount: 1, thresholded: false, sampled: false}};
  return report;
}

test("AI receives aggregated evidence with private paths, emails, phones and tokens removed", async () => {
  const evidence = ga4AnalysisEvidence(fixture()); const serialized = JSON.stringify(evidence);
  assert.ok(!/person@example|905555555555|token=secret|507f1f77/.test(serialized));
  let payload = "";
  const result = await analyzeGa4Report({report: fixture(), period: {range: "28d"}, locale: "ar", model: "fixture", baseUrl: "https://model.example/v1", apiKey: "fixture-key", fetchImpl: async (_url, init) => {
    payload = String(init?.body);
    return new Response(JSON.stringify({output: [{content: [{type: "output_text", text: JSON.stringify({summary: "Measured result", opportunities: [{area: "seo", title: "Review home", finding: "Home traffic", action: "Review title", evidenceIds: ["e2"], confidence: "medium"}], limitations: ["Top rows only"]})}]}]}));
  }});
  assert.equal(result.analysis.opportunities[0].evidenceIds[0], "e2");
  assert.ok(!payload.includes("token=secret")); assert.ok(payload.includes("NOT confirmed donations"));
  await assert.rejects(() => analyzeGa4Report({report: fixture(), period: {range: "28d"}, locale: "ar", model: "fixture", baseUrl: "https://model.example/v1", apiKey: "fixture", fetchImpl: async () => new Response(JSON.stringify({output_text: JSON.stringify({summary: "Invented", opportunities: [{area: "ads", title: "Bad", finding: "Bad", action: "Bad", evidenceIds: ["unknown"], confidence: "high"}], limitations: []})}))}), /INVALID_EVIDENCE/);
});

test("SEO handoff retains the exact date period and never turns missing top rows into zero traffic", () => {
  const period = {range: "custom" as const, startDate: "2026-10-01", endDate: "2026-10-20"};
  const link = ga4ManagedSeoLink("/ar/", period)!; const query = new URLSearchParams(link.split("?")[1]);
  assert.equal(query.get("page"), "home"); assert.equal(query.get("startDate"), period.startDate); assert.equal(query.get("ga4"), "1");
  assert.equal(ga4ManagedSeoLink("https://untrusted.example/ar", period), null);
  const context = ga4SeoEvidence(fixture(), period, "/ar/missing");
  assert.equal(context.pages.length, 0); assert.match(context.availability.note, /not proof of zero traffic/);
});
