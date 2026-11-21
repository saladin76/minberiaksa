import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const h = fs.readFileSync("components/minbar/concierge/useConcierge.ts", "utf8");
const r = fs.readFileSync("app/api/ai/donation-concierge/route.ts", "utf8");
test("a refused request is retried once without state or history instead of showing 'unavailable'", () => {
  assert.match(h, /if \(res\.status === 400\) res = await post\(base\);/);
  assert.match(h, /state: cleanState\(/);
  assert.match(h, /function safeSessionId\(id: unknown\): string/);
  assert.match(h, /\/\^\[A-Za-z0-9_-\]\{8,64\}\$\/\.test\(id\)/, "same rule as the server schema");
  assert.match(h, /filter\(\(t\) => !t\.error\)/, "error turns are not sent back as history");
});
test("the server logs which fields were refused, without their values", () => {
  assert.match(r, /console\.warn\("\[concierge\] invalid request:", Object\.keys\(parsed\.error\.flatten\(\)\.fieldErrors\)/);
});
