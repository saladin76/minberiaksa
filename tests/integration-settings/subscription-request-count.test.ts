import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("request badge reads only the open count, requires monthly permission and preserves read failures", async () => {
  let allowed = false, reads = 0, failed = false;
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "fixture" } }) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, key: string) => { assert.equal(key, "monthly"); return allowed ? null : new Response("Denied", { status: 403 }); } },
    "@/lib/donations/subscription-request-policy": { OPEN_REQUEST_STATUSES: ["NEW", "IN_PROGRESS"] },
    "@/lib/prisma": { prisma: { subscriptionServiceRequest: { count: async ({ where }: { where: unknown }) => { reads++; assert.equal(JSON.stringify(where), JSON.stringify({ status: { in: ["NEW", "IN_PROGRESS"] } })); if (failed) throw Error("Unavailable"); return 4; } } } },
  };
  const mod = { exports: {} as { GET: () => Promise<Response> } };
  runInNewContext(ts.transpileModule(readFileSync("app/api/admin/subscription-requests/count/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: mod, exports: mod.exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; },
  });
  assert.equal((await mod.exports.GET()).status, 403); assert.equal(reads, 0);
  allowed = true; const response = await mod.exports.GET(); assert.equal((await response.json()).count, 4); assert.match(response.headers.get("cache-control") || "", /no-store/);
  failed = true; const error = await mod.exports.GET(); assert.equal(error.status, 503); assert.equal((await error.json()).count, undefined);
});
