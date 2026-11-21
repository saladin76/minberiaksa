import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx", "utf8");
test("on a phone the conversation tools and attachment buttons fold away; on a computer nothing changes", () => {
  assert.match(s, /\$\{showTools \? "flex" : "hidden"\} w-full flex-wrap items-center gap-2 md:flex md:w-auto/);
  assert.match(s, /\$\{showAttach \|\| attachment \|\| recording \? "block" : "hidden"\} md:block/, "an attachment or a recording keeps the tools open");
  assert.match(s, /h-\[calc\(100dvh-7rem\)\]/, "follows Safari's visible height");
  assert.match(s, /text-base outline-none md:text-sm/, "16 px on phones: no zoom on focus");
});
