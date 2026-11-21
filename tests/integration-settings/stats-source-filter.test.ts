import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/api/admin/stats/route.ts", "utf8");
test("the home KPIs read and apply the donation-source filter like the chart and the list", () => {
  assert.match(s, /const source = searchParams\.get\('source'\)/);
  assert.match(s, /mergeDonationSourceFilter\(mergeDonationProviderFilter\(/);
  const get = s.slice(s.indexOf("export async function GET"));
  assert.equal((get.match(/\bprovider\)/g) ?? []).length, 0, "no call passes provider without source");
  assert.equal((get.match(/provider, source\s*\)/g) ?? []).length, 5);
});
