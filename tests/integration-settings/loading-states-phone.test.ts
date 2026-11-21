import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("notifications never show 0 before loading (no root loading.tsx: it would stream 200 for missing pages)", () => {
  assert.equal(fs.existsSync("app/[locale]/loading.tsx"), false);
  const n = fs.readFileSync("app/(dashboard)/dashboard/notifications/page.tsx", "utf8");
  assert.match(n, /\{loaded \? unread : "…"\}/);
  assert.match(n, /\{!loaded\?<p/);
});
