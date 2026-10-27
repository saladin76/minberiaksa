import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildGa4BatchRequests,
  fetchGa4DashboardReport,
  Ga4ApiError,
  isGa4Range,
  parseGa4BatchResponse,
  parseGa4ServiceAccountJson,
} from "../../lib/marketing/ga4-reporting";
import { pathToDashboardPermission } from "../../lib/dashboard/permissions";
import { DASHBOARD_NAV_GROUPS } from "../../lib/dashboard/nav-config";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../../lib/integration-settings/crypto";

test("GA4 report ranges and requests cover the dashboard reporting set", () => {
  assert.equal(isGa4Range("7d"), true);
  assert.equal(isGa4Range("28d"), true);
  assert.equal(isGa4Range("90d"), true);
  assert.equal(isGa4Range("all"), false);

  const requests = buildGa4BatchRequests("28d");
  assert.equal(requests.length, 8);
  assert.equal((requests[0].dateRanges as Array<{ startDate: string }>)[0].startDate, "28daysAgo");
  assert.deepEqual(requests[0].metrics, [
    { name: "activeUsers" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" },
    { name: "screenPageViews" }, { name: "engagementRate" }, { name: "bounceRate" }, { name: "keyEvents" },
  ]);
  assert.deepEqual(requests[2].dimensions, [{ name: "pagePath" }]);
  assert.equal(requests[2].limit, "25");
  assert.deepEqual(
    (requests[6].dimensionFilter as { filter: { fieldName: string; stringFilter: { value: string } } }).filter,
    { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "exception" } },
  );
  assert.deepEqual(requests[7].metrics, [{ name: "eventCount" }]);
});

test("GA4 batch response is mapped to stable summary and breakdown rows", () => {
  const report = parseGa4BatchResponse({
    reports: [
      { rows: [{ metricValues: ["12", "15", "4", "20", "50", "0.6", "0.4", "2"].map((value) => ({ value })) }] },
      { rows: [{ dimensionValues: [{ value: "20261023" }], metricValues: [{ value: "12" }, { value: "20" }, { value: "50" }] }] },
      { rows: [{ dimensionValues: [{ value: "/ar/bagislar" }, { value: "Donate" }], metricValues: [{ value: "31" }, { value: "9" }, { value: "12" }] }] },
      { rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "7" }, { value: "11" }, { value: "1" }] }] },
      { rows: [{ dimensionValues: [{ value: "Türkiye" }], metricValues: [{ value: "6" }, { value: "8" }] }] },
      { rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: [{ value: "10" }, { value: "18" }] }] },
      { rows: [{ dimensionValues: [{ value: "/ar/checkout" }], metricValues: [{ value: "3" }] }] },
      { rows: [{ metricValues: [{ value: "5" }] }] },
    ],
  });

  assert.equal(report.summary.activeUsers, 12);
  assert.equal(report.summary.engagementRate, 0.6);
  assert.equal(report.summary.bounceRate, 0.4);
  assert.equal(report.trend[0].date, "20261023");
  assert.equal(report.pages[0].pagePath, "/ar/bagislar");
  assert.equal(report.channels[0].channel, "Organic Search");
  assert.equal(report.countries[0].country, "Türkiye");
  assert.equal(report.devices[0].device, "mobile");
  assert.equal(report.exceptions[0].eventCount, 3);
  assert.equal(report.exceptionCount, 5);
});

test("empty or incomplete GA4 responses render as zeroed reports", () => {
  const report = parseGa4BatchResponse({ reports: [] });
  assert.equal(report.summary.activeUsers, 0);
  assert.deepEqual(report.pages, []);
  assert.equal(report.exceptionCount, 0);
});

test("service-account JSON accepts only the required Google service credentials", () => {
  const valid = parseGa4ServiceAccountJson(JSON.stringify({
    type: "service_account",
    client_email: "analytics-reader@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    project_id: "unused-extra-field",
  }));
  assert.deepEqual(valid, {
    type: "service_account",
    client_email: "analytics-reader@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });
  assert.equal(parseGa4ServiceAccountJson("not-json"), null);
  assert.equal(parseGa4ServiceAccountJson(JSON.stringify({ client_email: "a@example.com", private_key: "key" })), null);
});

test("stored GA4 service-account material is encrypted with a dedicated context", () => {
  const json = JSON.stringify({
    type: "service_account",
    client_email: "analytics-reader@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  });
  const context = "tracking-settings:ga4-service-account";
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const encrypted = encryptIntegrationSecret(json, context, key);
  assert.doesNotMatch(encrypted, /analytics-reader|PRIVATE KEY/);
  assert.equal(decryptIntegrationSecret(encrypted, context, key), json);
  assert.throws(() => decryptIntegrationSecret(encrypted, "tracking-settings:other", key));
});

test("report request uses scoped bearer access and maps provider errors without exposing their body", async () => {
  const requestedUrls: string[] = [];
  const requestedBodySizes: number[] = [];
  const authorizations: string[] = [];
  const result = await fetchGa4DashboardReport({
    propertyId: "123456789",
    accessToken: "private-test-token",
    range: "7d",
    fetchImpl: async (input, init) => {
      requestedUrls.push(String(input));
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      const requestedBody = JSON.parse(String(init?.body)) as { requests: unknown[] };
      requestedBodySizes.push(requestedBody.requests.length);
      return new Response(JSON.stringify({ reports: requestedBody.requests.map(() => ({})) }), { status: 200 });
    },
  });
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every((url) => /properties\/123456789:batchRunReports$/.test(url)));
  assert.deepEqual(authorizations, ["Bearer private-test-token", "Bearer private-test-token"]);
  assert.deepEqual(requestedBodySizes, [5, 3]);
  assert.equal(result.exceptionCount, 0);

  await assert.rejects(
    () => fetchGa4DashboardReport({
      propertyId: "123456789",
      accessToken: "unused",
      range: "7d",
      fetchImpl: async () => new Response(JSON.stringify({ error: "sensitive provider details" }), { status: 403 }),
    }),
    (error: unknown) => error instanceof Ga4ApiError && error.status === 403 && !error.message.includes("sensitive"),
  );
});

test("GA4 reports belong to Marketing and use the existing platform tracking settings", () => {
  assert.equal(pathToDashboardPermission("/dashboard/platform-connections/tracking"), "platformConnections");
  assert.equal(pathToDashboardPermission("/dashboard/google-analytics"), "platformConnections");
  const trackingSource = readFileSync("app/api/admin/tracking/route.ts", "utf8");
  const reportSource = readFileSync("app/api/admin/google-analytics/report/route.ts", "utf8");
  const marketingPage = readFileSync("app/(dashboard)/dashboard/marketing/tracking/page.tsx", "utf8");
  const platformTrackingPage = readFileSync("app/(dashboard)/dashboard/platform-connections/tracking/page.tsx", "utf8");
  const analyticsPage = readFileSync("app/(dashboard)/dashboard/google-analytics/page.tsx", "utf8");
  assert.equal(existsSync("app/(dashboard)/dashboard/marketing/tracking/_components/GoogleAnalyticsDashboard.tsx"), false);
  assert.equal(existsSync("app/(dashboard)/dashboard/platform-connections/tracking/_components/GoogleAnalyticsDashboard.tsx"), false);
  assert.equal(existsSync("app/(dashboard)/dashboard/google-analytics/_components/GoogleAnalyticsDashboard.tsx"), true);
  const settingsUi = readFileSync("app/(dashboard)/dashboard/platform-connections/tracking/_components/TrackingSettingsManager.tsx", "utf8");
  const homeGroup = DASHBOARD_NAV_GROUPS.find((group) => group.group === "الرئيسية");
  assert.equal(homeGroup?.items.some(item => item.href === "/dashboard/google-analytics"), false);
  const analyticsItem = DASHBOARD_NAV_GROUPS.find(group => group.group === "التسويق")?.items.find(item => item.href === "/dashboard/google-analytics");
  assert.equal(analyticsItem?.key, "platformConnections");
  assert.doesNotMatch(marketingPage, /GoogleAnalyticsDashboard/);
  assert.doesNotMatch(platformTrackingPage, /GoogleAnalyticsDashboard/);
  assert.match(analyticsPage, /resolveDashboardPageAccess/);
  assert.match(analyticsPage, /<GoogleAnalyticsDashboard\s*\/>/);
  assert.match(settingsUi, /settings\.gaPropertyId/);
  assert.match(settingsUi, /gaServiceAccountJson/);
  assert.match(trackingSource, /requireAdminOrDashboardPermission\(session, "platformConnectionsManage"\)/);
  assert.match(trackingSource, /encryptIntegrationSecret\(/);
  assert.match(trackingSource, /gaServiceAccountJsonPresent/);
  assert.doesNotMatch(trackingSource, /output\.gaServiceAccountEncrypted/);
  assert.match(reportSource, /requireAdminOrDashboardPermission[\s\S]*"platformConnections"/);
  const reportService = readFileSync("lib/marketing/ga4-server.ts", "utf8");
  assert.match(reportSource, /loadGa4DashboardReport/);
  assert.match(reportService, /getRawTrackingSettings\(\)/);
  assert.match(reportService, /analytics\.readonly/);
  assert.match(reportSource, /Cache-Control/);
  assert.doesNotMatch(reportSource, /NextResponse\.json\(\{[^}]*private_key/);
  assert.equal(existsSync("app/api/admin/google-analytics/config/route.ts"), false);
});
