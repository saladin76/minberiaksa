import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type RouteResponse = { status: number; body: Record<string, unknown> };
type Route = { POST: () => Promise<RouteResponse>; maxDuration: number };

function loadRoute(options: { permitted?: boolean; fail?: boolean } = {}) {
  let syncCalls = 0;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: Record<string, unknown>, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/permissions": { sessionHasDashboardPermission: () => options.permitted ?? true },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorId: "admin" }) },
    "@/lib/communication/whatsapp-template-sync": {
      syncMetaWhatsappTemplates: async () => {
        syncCalls += 1;
        if (options.fail) throw new Error("simulated sync failure");
        return { ok: true, fetched: 4, matchedTemplates: 2, variantsUpserted: 4, variantsRemoved: 0, wabasSynced: 1, unmatchedNames: [] };
      },
    },
  };
  const source = fs.readFileSync("app/api/dashboard/communication/whatsapp/templates/sync/route.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(output).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    console: { error: () => {} },
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
      return dependencies[id];
    },
  });
  return { route: loaded.exports as Route, calls: () => syncCalls };
}

test("template Meta sync route returns the synchronized result for an authorized operator", async () => {
  const { route, calls } = loadRoute();
  const response = await route.POST();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(calls(), 1);
  assert.equal(route.maxDuration, 300);
});

test("template Meta sync route reports authorization failures without calling Meta", async () => {
  const { route, calls } = loadRoute({ permitted: false });
  const response = await route.POST();
  assert.equal(response.status, 403);
  assert.equal(calls(), 0);
});

test("template Meta sync route returns visible JSON when sync throws", async () => {
  const { route, calls } = loadRoute({ fail: true });
  const response = await route.POST();
  assert.equal(response.status, 500);
  assert.equal(response.body.ok, false);
  assert.match(String(response.body.error), /Meta/);
  assert.equal(calls(), 1);
});
