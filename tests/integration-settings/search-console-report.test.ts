import assert from "node:assert/strict";
import test from "node:test";
import {fetchSearchConsole, searchConsoleDates} from "../../lib/marketing/search-console";

test("Search Console presets use Pacific calendar days across a UTC midnight", () => {
  assert.deepEqual(searchConsoleDates({range: "today"}, new Date("2026-10-25T01:00:00Z")), {startDate: "2026-10-24", endDate: "2026-10-24"});
  assert.deepEqual(searchConsoleDates({range: "7d"}, new Date("2026-10-25T01:00:00Z")), {startDate: "2026-10-17", endDate: "2026-10-23"});
});

test("Search Console discovers the matching readable property and preserves query/page grain", async () => {
  const requests: {dataState: string; rowLimit: number; dimensions: string[]}[] = [];
  const report = await fetchSearchConsole({accessToken: "fixture", origin: "https://donor.example", period: {range: "custom", startDate: "2026-10-01", endDate: "2026-10-20"}, fetchImpl: async (_url, init) => {
    if (init?.method === "GET") return new Response(JSON.stringify({siteEntry: [{siteUrl: "sc-domain:other.example"}, {siteUrl: "sc-domain:donor.example"}]}));
    const body = JSON.parse(String(init?.body)); requests.push(body);
    return new Response(JSON.stringify({rows: body.dimensions.length ? [{keys: ["donate zakat", "https://donor.example/ar?secret=omitted"], clicks: 10, impressions: 100, ctr: 0.1, position: 3}] : [{clicks: 20, impressions: 400, ctr: 0.05, position: 5}]}));
  }});
  assert.equal(report.status, "ready"); assert.equal(report.summary?.clicks, 20); assert.equal(report.rows[0].pagePath, "/ar"); assert.equal(report.rows[0].query, "donate zakat");
  assert.equal(requests[0].dataState, "all"); assert.equal(requests[1].rowLimit, 50);
});

test("missing permissions are unavailable data, and no other site's property is queried", async () => {
  const denied = await fetchSearchConsole({accessToken: "fixture", origin: "https://donor.example", period: {range: "28d"}, fetchImpl: async () => new Response("sensitive error", {status: 403})});
  assert.equal(denied.status, "access_denied"); assert.equal(denied.summary, undefined);
  let calls = 0;
  const other = await fetchSearchConsole({accessToken: "fixture", origin: "https://donor.example", property: "sc-domain:other.example", period: {range: "28d"}, fetchImpl: async () => {calls++; throw new Error();}});
  assert.equal(other.status, "property_unavailable"); assert.equal(calls, 0);
});
