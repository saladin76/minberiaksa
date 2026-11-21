import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/[locale]/profile/page.tsx", "utf8");
test("account page on a phone: one scrolling row of sections, a scrolling history table, Latin digits", () => {
  assert.match(s, /TabsList className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto/);
  assert.doesNotMatch(s, /grid grid-cols-2 sm:grid-cols-4 h-auto p-1/);
  assert.match(s, /min-w-\[620px\] text-sm md:min-w-0/);
  assert.doesNotMatch(s, /"ar-EG"/);
});
