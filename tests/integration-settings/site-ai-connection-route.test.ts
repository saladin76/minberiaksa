import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { AiConnectionError } from "../../lib/ai/core/connection-config";
function fixture(access: "none" | "view" | "test" | "manage" | "all") {
  const calls: string[] = [];
  const denied = { status: 403 };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number; headers: unknown }) => ({ body, ...options }) } },
    "next-auth": { getServerSession: async () => access === "none" ? null : { user: {} } },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/integration-settings/auth": { requireIntegrationSettingsView: () => access === "none" ? denied : null, requireIntegrationSettingsManage: () => ["manage", "all"].includes(access) ? null : denied, requireIntegrationSettingsTest: () => ["test", "all"].includes(access) ? null : denied },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({}), queueAuditLog: () => calls.push("audit") },
    "@/lib/ai/core/connection-config": { AiConnectionError },
    "@/lib/ai/core/connection-settings": { getAiConnectionConfig: async () => ({ snapshot: async () => { calls.push("read"); return { keyPresent: true }; }, save: async () => { calls.push("save"); return { model: "fixture", enabled: true, keyPresent: true }; }, test: async () => { calls.push("test"); return { check: "MODEL_ACCESS" }; } }) },
  };
  const loaded = { exports: {} as Record<string, (input?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>> };
  const code = ts.transpileModule(fs.readFileSync("app/api/admin/ai/connection/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, JSON, require: (id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; } });
  return { calls, route: loaded.exports, request: (body: unknown) => ({ text: async () => JSON.stringify(body) }) };
}
test("unauthorized reads, writes and tests stop before settings access", async () => {
  const h = fixture("none");
  for (const method of ["GET", "PUT", "POST"]) assert.equal((await h.route[method](h.request({}))).status, 403);
  assert.deepEqual(h.calls, []);
});
test("view-only and test-only staff cannot replace keys or test arbitrary configuration", async () => {
  const view = fixture("view"); assert.equal((await view.route.GET()).status, 200);
  assert.equal((await view.route.PUT(view.request({}))).status, 403); assert.equal((await view.route.POST(view.request({}))).status, 403);
  const tester = fixture("test"); assert.equal((await tester.route.POST(tester.request({}))).status, 200);
  assert.equal((await tester.route.POST(tester.request({ model: "other" }))).status, 403); assert.equal((await tester.route.POST(tester.request({ apiKey: "secret" }))).status, 403);
  assert.deepEqual(tester.calls, ["test"]);
});
test("saving and testing remain independent and responses are never cached", async () => {
  const h = fixture("all");
  const saved = await h.route.PUT(h.request({})); assert.equal(saved.status, 200); assert.deepEqual(h.calls, ["save", "audit"]);
  const tested = await h.route.POST(h.request({ model: "fixture" })); assert.equal(tested.status, 200); assert.deepEqual(h.calls, ["save", "audit", "test"]);
  assert.equal((saved as unknown as { headers: Record<string, string> }).headers["Cache-Control"], "no-store");
});
test("oversized and malformed inputs are rejected before key reads or saves", async () => {
  const h = fixture("all");
  assert.equal((await h.route.PUT(h.request({ apiKey: "x".repeat(5000) }))).status, 400);
  assert.equal((await h.route.POST({ text: async () => "<html>failure</html>" })).status, 400);
  assert.deepEqual(h.calls, []);
});
