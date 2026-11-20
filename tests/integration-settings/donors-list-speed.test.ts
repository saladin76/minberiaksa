import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("badges for a page of donors are evaluated together, attached in badge order", () => {
  const s = fs.readFileSync("lib/badge-criteria.ts", "utf8");
  assert.match(s, /await Promise\.all\(badges\.map\(\(badge\) => getUserIdsMatchingBadge\(badge\.criteria, userIds\)\)\)/);
  assert.doesNotMatch(s, /for \(const badge of badges\) \{\n\s*const matching = await/);
});
test("the registered-donors total is cached, and a failed count is not kept", () => {
  const s = fs.readFileSync("app/api/users/route.ts", "utf8");
  assert.equal((s.match(/registeredDonorsTotalCached\(\(\) => prisma\.user\.count/g) ?? []).length, 1);
  assert.match(s, /catch\(\(error\) => \{ registeredDonorsCache = null; throw error; \}\)/);
});
