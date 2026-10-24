import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("authenticated ads diagnostics are evaluated at request time, not during static build collection", () => {
  const routes = [
    "acquisition", "breakdown", "diagnostics", "donation-detail/[id]", "donations-list", "overview",
  ].map((name) => readFileSync(`app/api/admin/ads/${name}/route.ts`, "utf8"));
  for (const source of routes) {
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /getServerSession\(authOptions\)/);
  }
});
