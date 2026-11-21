import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("public pages show a loader between taps; notifications never show 0 before loading", () => {
  assert.match(fs.readFileSync("app/[locale]/loading.tsx", "utf8"), /role="status"/);
  const n = fs.readFileSync("app/(dashboard)/dashboard/notifications/page.tsx", "utf8");
  assert.match(n, /\{loaded \? unread : "…"\}/);
  assert.match(n, /\{!loaded\?<p/);
});
