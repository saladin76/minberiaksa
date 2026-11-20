import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/api/admin/donations/chart/route.ts", "utf8");
test("the chart does not load donation items it never reads", () => {
  assert.doesNotMatch(s, /items: \{ select: \{ amount: true, amountUSD: true \} \}/);
  assert.doesNotMatch(s, /d\.(items|categoryItems)/);
  assert.match(fs.readFileSync("lib/dashboard/donation-usd-revenue.ts", "utf8"), /export function donationRowUsdApprox\(row: \{\n\s+amountUSD: number \| null;\n\s+amount: number;\n\s+currency: string;\n\}\)/, "the USD estimate needs only amountUSD, amount and currency");
});
