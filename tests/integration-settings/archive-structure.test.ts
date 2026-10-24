import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

test("archive dashboard pages are retired and old paths redirect safely", () => {
  const route = "app/(dashboard)/dashboard/archive/[[...archivePath]]/page.tsx";
  assert.ok(existsSync(route));
  assert.match(readFileSync(route, "utf8"), /redirect\("\/dashboard"\)/);
  for (const page of [
    "app/(dashboard)/dashboard/archive/page.tsx",
    "app/(dashboard)/dashboard/archive/layout.tsx",
    "app/(dashboard)/dashboard/archive/collections/page.tsx",
    "app/(dashboard)/dashboard/archive/assets/page.tsx",
  ]) assert.equal(existsSync(page), false, page + " should not remain a dashboard destination");
});

test("archive APIs remain protected and the retired dashboard UI is removed", () => {
  const api = readFileSync("app/api/admin/archive/uploaded-files/route.ts", "utf8");
  assert.match(api, /requireArchiveUploadedFileListAccess/);
  assert.match(api, /requireArchiveActionAccess\("archiveUpload"\)/);
  assert.deepEqual(readdirSync("app/(dashboard)/dashboard/archive/_components"), []);
});
