import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function fixture(role: string | null, allowed = true) {
  let reads = 0, cancellations = 0;
  const task = { id: "a".repeat(64), ownerId: "operator", permission: "campaigns", result: { title: "Private reviewed proposal" } };
  const deps: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => role ? { user: { id: "operator", role } } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/permissions": { isDashboardPermissionKey: (key: string) => key === "campaigns" },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => allowed && permission === "campaigns" ? null : Response.json({ error: "Forbidden" }, { status: 403 }) },
    "@/lib/content-editor/suggestion-tasks": {
      taskJson: (body: unknown, status = 200) => Response.json(body, { status }),
      readSuggestionTask: async (_id: string, ownerId: string) => { reads++; assert.equal(ownerId, "operator"); return task; },
      suggestionTaskResponse: async () => Response.json(task.result), cancelSuggestionTask: async () => { cancellations++; },
    },
  };
  const loaded = { exports: {} as { GET: (request: unknown, ctx: unknown) => Promise<Response>; DELETE: (request: unknown, ctx: unknown) => Promise<Response> } };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/ai/suggestions/[id]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  const ctx = { params: Promise.resolve({ id: task.id }) };
  return { get: () => loaded.exports.GET({}, ctx), cancel: () => loaded.exports.DELETE({}, ctx), counts: () => ({ reads, cancellations }) };
}
for (const role of [null, "DONOR"]) test(`${role || "unauthenticated"} cannot read or cancel retained editor proposals`, async () => {
  const h = fixture(role); assert.equal((await h.get()).status, role ? 403 : 401); assert.equal((await h.cancel()).status, role ? 403 : 401);
  assert.deepEqual(h.counts(), { reads: 0, cancellations: 0 });
});
test("revoked section permission blocks proposal reads and cancellation for staff", async () => {
  const h = fixture("STAFF", false); const response = await h.get(); assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /Private reviewed/);
  assert.equal((await h.cancel()).status, 403); assert.equal(h.counts().cancellations, 0);
});
test("an authorized operator can read and cancel only after the section guard succeeds", async () => {
  const h = fixture("STAFF"); assert.equal((await h.get()).status, 200); assert.equal((await h.cancel()).status, 200); assert.equal(h.counts().cancellations, 1);
});
