import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Was operations-archive-structure.test.ts. Every operations assertion in it described pages that
 * no longer exist — the التشغيل nav group, the five approved operations pages, their legacy
 * redirect targets, and the donor-reactivation masking page. Those tests could only fail, and a
 * test that pins removed behaviour is worse than no test. What remains is the archive half, which
 * is untouched by that removal.
 */

test("archive is protected before nested page reads", () => {
  const source = read("app/(dashboard)/dashboard/archive/layout.tsx");
  assert.match(source, /getServerSession/);
  assert.match(source, /resolveDashboardPageAccess/);
  assert.match(source, /redirect\(access\.redirectTo\)/);
});

test("archive root and duplicate upload routes redirect to canonical pages", () => {
  const redirects: Record<string, string> = {
    "app/(dashboard)/dashboard/archive/page.tsx": "/dashboard/archive/collections",
    "app/(dashboard)/dashboard/archive/marketing-files/page.tsx": "/dashboard/archive/assets?category=MARKETING",
    "app/(dashboard)/dashboard/archive/documents/page.tsx": "/dashboard/archive/assets?category=DOCUMENTS",
  };

  for (const [path, destination] of Object.entries(redirects)) {
    assert.ok(read(path).includes(`redirect("${destination}")`));
  }
});
