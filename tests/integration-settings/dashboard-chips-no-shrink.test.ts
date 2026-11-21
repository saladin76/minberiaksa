import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("phone width rule does not let every element shrink; language chips keep their width", () => {
  assert.doesNotMatch(fs.readFileSync("styles/dashboard-utilities.css", "utf8"), /main > header \+ div \* \{ min-width: 0; \}/);
  const s = fs.readFileSync("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx", "utf8");
  assert.equal((s.match(/inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1/g) ?? []).length, 2);
});
