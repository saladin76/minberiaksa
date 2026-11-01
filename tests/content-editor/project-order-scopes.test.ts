import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type { PrismaClient } from "@prisma/client";
import { parseProjectRanks, replaceProjectRanks, writeProjectBatch } from "../../lib/campaign/reorder";
import { compareProjectOrder, orderProjectsInCategory } from "../../lib/content-editor/project-order";
import * as categories from "../../lib/campaign/categories";

const catA = "a".repeat(24), catB = "b".repeat(24), idA = "1".repeat(24), idB = "2".repeat(24), idC = "3".repeat(24);
function fixture() {
  let rows = [
    { id: idA, title: "A", priority: 0 as number | null, categoryPriorities: { [catA]: 1, [catB]: 0 }, categoryIds: [catA, catB], updatedAt: new Date(0), editorVersion: null as string | null, isDeleted: false, createdAt: "2026-01-01" },
    { id: idB, title: "B", priority: 1 as number | null, categoryPriorities: { [catA]: 0 }, categoryIds: [catA], updatedAt: new Date(0), editorVersion: null as string | null, isDeleted: false, createdAt: "2026-01-02" },
    { id: idC, title: "C", priority: null as number | null, categoryPriorities: {}, categoryIds: [catB], updatedAt: new Date(0), editorVersion: null as string | null, isDeleted: false, createdAt: "2026-01-03" },
  ];
  let inTransaction = false, allowed = true, writes = 0, batches = 0, failBatch = false;
  const db = {
    category: { findUnique: async ({ where }: { where: { id: string } }) => [catA, catB].includes(where.id) ? { id: where.id } : null },
    campaign: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; AND?: { categoryIds?: { has: string } }[] } }) => rows.filter(row => !row.isDeleted && (!where.id || where.id.in.includes(row.id)) && (where.AND || []).every(scope => !scope.categoryIds || row.categoryIds.includes(scope.categoryIds.has))),
      findUnique: async ({ where }: { where: { id: string } }) => rows.find(row => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        assert.equal(inTransaction, true, "Every write must execute inside the transaction");
        writes++; const row = rows.find(row => row.id === where.id)!; Object.assign(row, data); return row;
      },
    },
    $runCommandRaw: async (command: { updates: { q: { _id: { $oid: string }; updatedAt?: { $date: string } }; u: { $set: Record<string, unknown> } }[] }) => {
      assert.equal(inTransaction, true); batches++;
      let n = 0;
      for (const update of command.updates) {
        const row = rows.find(row => row.id === update.q._id.$oid && (!update.q.updatedAt || row.updatedAt.toISOString() === update.q.updatedAt.$date));
        if (!row) continue;
        n++; writes++; Object.assign(row, update.u.$set); row.updatedAt = new Date((update.u.$set.updatedAt as { $date: string }).$date);
        if (failBatch) return { ok: 1, n, writeErrors: [{ code: 99 }] };
      }
      return { ok: 1, n, nModified: n };
    },
    $transaction: async (run: (tx: unknown) => Promise<void>) => { const snapshot = structuredClone(rows); inTransaction = true; try { await run(db); } catch (error) { rows = snapshot; throw error; } finally { inTransaction = false; } },
  };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => ({ user: { id: catA } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => allowed ? null : Response.json({}, { status: 403 }) },
    "@/lib/prisma": { prisma: db }, "@/lib/campaign/reorder": { parseProjectRanks, replaceProjectRanks, writeProjectBatch }, "next/cache": { revalidatePath() {} },
    "@/lib/audit-log": { queueAuditLog() {}, writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({}) },
    "@/lib/content-editor/service": { fingerprint: JSON.stringify, documentFor: () => ({ statuses: {} }) },
    "@/lib/content-editor/site-capabilities": { HAS_IMPACT_BACKING_CAMPAIGNS: false, campaignWorkspaceWhere: () => ({}) },
    "@/lib/dashboard/write-error-message": { writeErrorMessage: () => "Failed" }, "@/lib/campaign/categories": categories, "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED: {} },
  };
  function load(file: string) {
    const mod = { exports: {} as { POST: (req: Request, ctx?: unknown) => Promise<Response> } };
    new vm.Script(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)
      .runInNewContext({ module: mod, exports: mod.exports, Error, console: { error() {} }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    return mod.exports;
  }
  const workspace = load("app/api/admin/content-editor/[kind]/workspace-list/route.ts");
  const global = load("app/api/campaigns/reorder/route.ts"), category = load("app/api/categories/[id]/prioritized-campaigns/route.ts");
  const req = (campaigns: unknown) => new Request("https://fixture.invalid/order", { method: "POST", body: JSON.stringify({ campaigns }) });
  return { db: db as unknown as PrismaClient, rows: () => rows, batches: () => batches, failBatch: () => { failBatch = true; }, writes: () => writes, workspace: (body: unknown) => workspace.POST(new Request("https://fixture.invalid/workspace", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ kind: "campaigns" }) }), deny: () => { allowed = false; },
    global: (updates: unknown) => global.POST(req(updates)), category: (updates: unknown, id = catA) => category.POST(req(updates), { params: Promise.resolve({ id }) }),
  };
}

test("category saves change only that category, removed ranks clear, and global ordering remains independent", async () => {
  const f = fixture();
  assert.equal((await f.category([{ id: idA, order: 0 }])).status, 200);
  assert.deepEqual(f.rows().map(row => row.priority), [0, 1, null]);
  assert.deepEqual(f.rows()[0].categoryPriorities, { [catA]: 0, [catB]: 0 }); assert.deepEqual(f.rows()[1].categoryPriorities, {});
  assert.equal((await f.global([{ id: idB, order: 0 }, { id: idC, order: 1 }])).status, 200);
  assert.deepEqual(f.rows().map(row => row.priority), [null, 0, 1]);
  assert.equal(f.rows()[0].categoryPriorities[catA], 0); assert.equal(f.rows()[0].categoryPriorities[catB], 0);
  assert.equal((await f.category([])).status, 200);
  assert.deepEqual(f.rows()[0].categoryPriorities, { [catB]: 0 });
});

test("invalid, foreign, deleted, duplicate and unbounded reorder submissions do not partly change the saved order", async () => {
  for (const updates of [[{ id: idA, order: -1 }], [{ id: idA, order: 0.5 }], [{ id: idA, order: 0 }, { id: idA, order: 1 }], [{ id: "bad", order: 0 }], Array.from({ length: 501 }, () => ({ id: idA, order: 0 }))]) {
    const f = fixture(); assert.equal((await f.global(updates)).status, 400); assert.equal(f.writes(), 0);
  }
  const foreign = fixture(); assert.equal((await foreign.category([{ id: idC, order: 0 }])).status, 400); assert.equal(foreign.writes(), 0);
  assert.equal((await foreign.category([], "e".repeat(24))).status, 400); assert.equal(foreign.writes(), 0);
  const deleted = fixture(); deleted.rows()[0].isDeleted = true; assert.equal((await deleted.global([{ id: idA, order: 0 }])).status, 400); assert.equal(deleted.writes(), 0);
  const denied = fixture(); denied.deny(); assert.equal((await denied.global([])).status, 403); assert.equal((await denied.category([])).status, 403); assert.equal(denied.writes(), 0);
});

test("the public category ordering retains its own zero rank and falls back to current global order without mutating it", async () => {
  const f = fixture();
  const global = [...f.rows()].sort(compareProjectOrder);
  assert.deepEqual(global.map(row => row.id), [idA, idB, idC]);
  assert.deepEqual(orderProjectsInCategory(global.filter(row => row.categoryIds.includes(catA)), catA).map(row => row.id), [idB, idA]);
  await replaceProjectRanks(f.db, [{ id: idA, order: 0 }, { id: idB, order: 1 }], catA);
  assert.deepEqual(orderProjectsInCategory(global, catA).map(row => row.id), [idA, idB, idC]);
  assert.deepEqual(global.map(row => row.id), [idA, idB, idC]);
});

test("the real workspace saves the selected scope in one batch and rejects stale or foreign-category edits atomically", async () => {
  const f = fixture();
  const revision = (row: ReturnType<typeof f.rows>[number]) => JSON.stringify([row.editorVersion, row.updatedAt]);
  const payload = (id: string, order: number | null) => ({ id, order, revision: revision(f.rows().find(row => row.id === id)!) });
  const global = { action: "order", items: [payload(idA, 2), payload(idB, 0)] };
  assert.equal((await f.workspace(global)).status, 200); assert.equal(f.batches(), 1);
  assert.deepEqual(f.rows().map(row => row.priority), [2, 0, null]); assert.equal(f.rows()[0].categoryPriorities[catA], 1);
  assert.equal((await f.workspace(global)).status, 409); assert.equal(f.batches(), 1);
  assert.equal((await f.workspace({ action: "order", categoryId: catA, items: [payload(idA, 0), payload(idC, 0)] })).status, 409); assert.equal(f.batches(), 1);
  assert.equal((await f.workspace({ action: "order", categoryId: catA, items: [payload(idA, 0), payload(idB, null)] })).status, 200); assert.equal(f.batches(), 2);
  assert.deepEqual(f.rows()[0].categoryPriorities, { [catA]: 0, [catB]: 0 }); assert.deepEqual(f.rows()[1].categoryPriorities, {}); assert.deepEqual(f.rows().map(row => row.priority), [2, 0, null]);
});

test("a Mongo bulk write error rolls back the entire order rather than leaving a partial update", async () => {
  const f = fixture(), before = structuredClone(f.rows()); f.failBatch();
  await assert.rejects(replaceProjectRanks(f.db, [{ id: idB, order: 0 }]), /PROJECT_BATCH_FAILED/);
  assert.deepEqual(f.rows(), before);
});
