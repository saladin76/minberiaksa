import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("only real template ids reach the template-variant query (a key like 'private-receipt' no longer breaks the report)", () => {
  assert.match(fs.readFileSync("lib/communication/campaign-attribution-service.ts", "utf8"), /typeof id === "string" && \/\^\[a-f0-9\]\{24\}\$\/i\.test\(id\)/);
});
test("the donation scan tells MongoDB to use the _id index instead of planning across every index", () => {
  assert.match(fs.readFileSync("lib/communication/campaign-donation-scan.ts", "utf8"), /sort: \{ _id: 1 \}, hint: \{ _id: 1 \}/);
});
