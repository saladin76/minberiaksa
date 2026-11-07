import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEFAULT_RECURRING_PAGE_SETTINGS, recurringPageAmounts, recurringPageProjects, type RecurringPageSettings } from "../../lib/minbar/recurring-page-settings";
import * as validation from "../../lib/minbar/recurring-page-settings-validation";
import { NOT_SOFT_DELETED } from "../../lib/campaign/soft-delete-filter";

const a = "a".repeat(24), b = "b".repeat(24), c = "c".repeat(24);
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function load<T>(file: string, deps: Record<string, unknown>) {
  const mod = { exports: {} as T };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, process: { env: { DATABASE_URL: "fixture" } }, structuredClone, Map, Set, Promise, console, require: (id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; } });
  return mod.exports;
}
function storeFixture() {
  let row: { configuration: RecurringPageSettings; revision: string } | null = null, writes = 0, reads = 0, unavailable = false;
  const queries: unknown[] = [];
  const db = {
    recurringPageSettings: {
      findUnique: async () => { reads++; if (unavailable) throw new Error("db down"); return row ? structuredClone(row) : null; },
      create: async ({ data }: { data: typeof row }) => { if (row) throw { code: "P2002" }; writes++; row = structuredClone(data); return row; },
      updateMany: async ({ where, data }: { where: { revision: string }; data: typeof row }) => { if (!row || row.revision !== where.revision) return { count: 0 }; writes++; row = structuredClone(data); return { count: 1 }; },
    },
    campaign: { findMany: async (query: unknown) => { queries.push(query); return [{ id: a, title: "First" }, { id: b, title: "Second" }]; } },
  };
  type Service = { readRecurringPageSettings: () => Promise<{ settings: RecurringPageSettings; revision: string | null }>; publicRecurringPageSettings: () => Promise<RecurringPageSettings>; saveRecurringPageSettings: (settings: RecurringPageSettings, revision: string | null) => Promise<{ settings: RecurringPageSettings; revision: string }> };
  const service = load<Service>("lib/minbar/recurring-page-settings-service.ts", { "server-only": {}, "node:crypto": { randomUUID }, "@/lib/prisma": { prisma: db }, "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED }, "./recurring-page-settings-validation": validation });
  return { service, queries, counts: () => ({ writes, reads }), failReads: () => { unavailable = true; } };
}

test("old installations retain presets; invalid inputs and an empty manual selection are refused", () => {
  assert.deepEqual(validation.parseRecurringPageSettings(null), DEFAULT_RECURRING_PAGE_SETTINGS);
  assert.deepEqual(validation.parseRecurringPageSettings({ ...DEFAULT_RECURRING_PAGE_SETTINGS, projectIds: [a.toUpperCase()] }).projectIds, [a]);
  for (const change of [{ amounts: [] }, { amounts: [0] }, { amounts: [-1] }, { amounts: [NaN] }, { amounts: [Infinity] }, { amounts: [1, 1] }, { byCurrency: { MAD: [10] } }, { projectMode: "SELECTED", projectIds: [] }, { projectIds: [a, a] }, { projectIds: [a, a.toUpperCase()] }, { frequency: "DAILY" }]) {
    assert.equal(validation.recurringPageSettingsSchema.safeParse({ ...DEFAULT_RECURRING_PAGE_SETTINGS, ...change }).success, false, JSON.stringify(change));
  }
});
test("project selection follows saved order without resurrecting unpublished or removed projects", () => {
  const pool = [{ id: a, title: "Localized first" }, { id: b, title: "Localized second" }];
  const settings: RecurringPageSettings = { ...DEFAULT_RECURRING_PAGE_SETTINGS, projectMode: "SELECTED", projectIds: [b, c, a] };
  assert.deepEqual(recurringPageProjects(pool, settings).map(project => project.title), ["Localized second", "Localized first"]);
  assert.deepEqual(recurringPageProjects([], settings), []);
  assert.equal(recurringPageProjects(pool, DEFAULT_RECURRING_PAGE_SETTINGS), pool);
});
test("fixed currency amounts are distinct from USD presets and need a usable rate", () => {
  const settings = { ...DEFAULT_RECURRING_PAGE_SETTINGS, byCurrency: { TRY: [150, 300], KWD: [1.25, 2.5] } };
  assert.deepEqual(recurringPageAmounts(settings, "TRY", 40), { amounts: [150, 300], local: true });
  assert.deepEqual(recurringPageAmounts(settings, "KWD", 0.3), { amounts: [1.25, 2.5], local: true });
  for (const rate of [null, 0, -1, NaN]) assert.deepEqual(recurringPageAmounts(settings, "TRY", rate), { amounts: settings.amounts, local: false });
  assert.deepEqual(recurringPageAmounts(settings, "USD", 1), { amounts: settings.amounts, local: false });
});
test("settings use one atomic revision and reject concurrent creation or stale writes", async () => {
  const f = storeFixture();
  assert.equal((await f.service.readRecurringPageSettings()).revision, null);
  const next = { ...DEFAULT_RECURRING_PAGE_SETTINGS, amounts: [10, 20] };
  const results = await Promise.allSettled([f.service.saveRecurringPageSettings(next, null), f.service.saveRecurringPageSettings(next, null)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const first = await f.service.readRecurringPageSettings(); assert.equal(f.counts().writes, 1);
  const saved = await f.service.saveRecurringPageSettings({ ...next, amounts: [40] }, first.revision);
  await assert.rejects(f.service.saveRecurringPageSettings(next, first.revision));
  assert.equal(f.counts().writes, 2); assert.notEqual(saved.revision, first.revision);
  assert.deepEqual(clean((await f.service.readRecurringPageSettings()).settings.amounts), [40]);
});
test("a project unpublished before save and a failed read cannot widen destinations or alter billing", async () => {
  const f = storeFixture();
  await assert.rejects(f.service.saveRecurringPageSettings({ ...DEFAULT_RECURRING_PAGE_SETTINGS, projectMode: "SELECTED", projectIds: [c] }, null));
  assert.equal(f.counts().writes, 0);
  const query = JSON.stringify(f.queries); assert.match(query, /isActive/); assert.match(query, /isDeleted/);
  f.failReads(); await assert.rejects(f.service.publicRecurringPageSettings(), /db down/);
  assert.equal(f.counts().writes, 0);
});
test("settings endpoints authorize before reads, parsing or writes and reject unexpected billing fields", async () => {
  let denied = true, reads = 0, writes = 0;
  const route = load<{ GET: () => Promise<{ status: number }>; PUT: (request: { json: () => Promise<unknown> }) => Promise<{ status: number }> }>("app/api/admin/recurring-page-settings/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }) } }, "next-auth": { getServerSession: async () => ({ user: { id: "operator" } }) }, zod: { z },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { assert.equal(permission, "monthly"); return denied ? { status: 403 } : null; } },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({}), writeAuditLog: async () => {} }, "@/lib/minbar/recurring-page-settings-validation": validation,
    "@/lib/minbar/recurring-page-settings-service": { readRecurringPageSettings: async () => { reads++; return { settings: DEFAULT_RECURRING_PAGE_SETTINGS, revision: null }; }, recurringPageProjectOptions: async () => { reads++; return []; }, saveRecurringPageSettings: async () => { writes++; return { settings: DEFAULT_RECURRING_PAGE_SETTINGS, revision: randomUUID() }; }, RecurringPageSettingsConflict: class extends Error {}, RecurringPageProjectUnavailable: class extends Error {} },
  });
  assert.equal((await route.GET()).status, 403);
  assert.equal((await route.PUT({ json: async () => { throw new Error("must not parse"); } })).status, 403); assert.equal(reads + writes, 0);
  denied = false;
  assert.equal((await route.PUT({ json: async () => ({ revision: null, settings: { ...DEFAULT_RECURRING_PAGE_SETTINGS, nextBillingDate: "2026-01-01" } }) })).status, 400);
  assert.equal(writes, 0); assert.equal((await route.GET()).status, 200); assert.equal(reads, 2);
});
