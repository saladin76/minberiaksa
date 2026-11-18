import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** Security (2026-11-18): this public route returned full donation records (access tokens, bank responses). */
test("the public per-project donations route stays removed", () => {
  assert.equal(fs.existsSync("app/api/campaigns/[id]/donations/route.ts"), false);
});
