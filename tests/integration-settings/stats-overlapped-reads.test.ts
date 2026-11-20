import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/api/admin/stats/route.ts", "utf8");
test("the stats endpoint starts its independent reads before the main block and awaits them later", () => {
  const start = s.indexOf("const totalPaidAggP"), block = s.indexOf("totalCampaigns,");
  assert.ok(start > 0 && start < block, "started before the main Promise.all");
  for (const p of ["totalPaidAggP", "supportFeesP", "globalPaidAggP", "globalCountsP"]) assert.match(s, new RegExp(`await ${p}\\b|\\(await ${p}\\)`), p);
  assert.match(s, /p\.catch\(\(\) => undefined\)/, "no unhandled rejection while waiting");
  assert.equal((s.match(/const SUPPORT_FEES_PAGE = 5000;/g) ?? []).length, 1, "the paging loop exists once (moved, not duplicated)");
});
