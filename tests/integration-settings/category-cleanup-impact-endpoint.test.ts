import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function endpoint(mode: "allowed" | "denied" | "failure") {
  let reads = 0;
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number; headers?: unknown }) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    "next-auth": { getServerSession: async () => ({ user: { role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { assert.equal(permission, "categories"); return mode === "denied" ? { status: 403 } : null; } },
    "@/lib/prisma": { prisma: Object.freeze({}) },
    "@/scripts/audit-retired-category-cleanup.mjs": { auditCategoryCleanup: async () => { reads++; if (mode === "failure") throw new Error("private database details"); return { readOnly: true, databaseWrites: 0, reviewHash: "scope-fingerprint", blockingIssues: ["PROJECTS_SHARED_WITH_OTHER_CATEGORIES"] }; } },
  };
  const code = ts.transpileModule(fs.readFileSync("app/api/admin/categories/cleanup-impact/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { GET: () => Promise<{ status: number; body: unknown; headers?: unknown }> } };
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, require: (id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; } });
  return { get: () => loaded.exports.GET(), reads: () => reads };
}

test("cleanup impact requires category permission before reading the production scope", async () => {
  const h = endpoint("denied"); assert.equal((await h.get()).status, 403); assert.equal(h.reads(), 0);
});
test("impact reports preserve the review fingerprint and shared-project blockers without mutations", async () => {
  const h = endpoint("allowed"), result = await h.get();
  assert.equal(result.status, 200); assert.equal(h.reads(), 1);
  assert.equal(JSON.stringify(result.body), JSON.stringify({ readOnly: true, databaseWrites: 0, reviewHash: "scope-fingerprint", blockingIssues: ["PROJECTS_SHARED_WITH_OTHER_CATEGORIES"] }));
  assert.equal(JSON.stringify(result.headers), JSON.stringify({ "Cache-Control": "no-store" }));
});
test("an unavailable impact audit is never an empty success or a private error disclosure", async () => {
  const result = await endpoint("failure").get(); assert.equal(result.status, 503);
  assert.equal(JSON.stringify(result.body), JSON.stringify({ error: "CATEGORY_CLEANUP_IMPACT_UNAVAILABLE", readOnly: true, databaseWrites: 0 }));
});
