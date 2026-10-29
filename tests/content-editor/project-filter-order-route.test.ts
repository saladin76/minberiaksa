import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import { z } from "zod";
import * as options from "../../lib/minbar/project-filter-options";

function load(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>> };
  new vm.Script(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, URL, require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return loaded.exports;
}
function fixture() {
  const category = "a".repeat(24), programme = "b".repeat(24), keys = [`category:${category}`, `programme:${programme}`];
  let saved: string[] | null = null, allowed = true, reads = 0, writes = 0, race = false;
  const database = { category: { findMany: async () => { reads++; return [{ id: category, name: "Category", slug: "category", order: 1, translations: [] }]; } }, superCategory: { findMany: async () => [{ id: programme, title: "Programme", slug: "major", order: 0, translations: [], items: [], blocks: [] }] }, globalSettings: { findFirst: async () => ({ id: "settings", updatedAt: new Date(0), projectFilterOrder: saved }), updateMany: async (input: { data: Record<string, unknown> }) => { writes++; assert.deepEqual(Object.keys(input.data), ["projectFilterOrder"]); if (!race) saved = input.data.projectFilterOrder as string[]; return { count: race ? 0 : 1 }; } }, $transaction: async (fn: (tx: unknown) => unknown) => fn(database) };
  const registry = load("lib/minbar/project-filters.ts", { "server-only": {}, "@/lib/prisma": { prisma: database }, "@/lib/campaign/soft-delete-filter": { CATEGORY_ACTIVE_OR_UNSET: {} }, "@/lib/i18n/translation-fallback": { pickTranslation: () => null, translationLocaleWhere: () => ({}) }, "./project-filter-options": options });
  const route = load("app/api/admin/project-filters/route.ts", { "node:crypto": crypto, "zod": { z }, "next/server": { NextResponse: { json: (body: unknown, config?: { status?: number }) => ({ body, status: config?.status || 200 }) } }, "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/lib/prisma": { prisma: database }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => allowed ? null : { status: 403 } }, "@/lib/minbar/project-filters": registry, "@/lib/audit-log": { auditActorFromDashboardSession: () => ({}), queueAuditLog: () => {} }, "@/lib/locales": { isValidLocale: () => true } });
  return { keys, get: () => route.GET({ nextUrl: new URL("https://example.invalid/api?locale=ar") }), put: (body: unknown) => route.PUT({ json: async () => body }), saved: () => saved, writes: () => writes, reads: () => reads, deny: () => { allowed = false; }, race: () => { race = true; } };
}
test("the real registry and order endpoint save both identity kinds without changing financial/content fields", async () => {
  const f = fixture(), first = await f.get(), body = first.body as { revision: string; items: { key: string }[] };
  assert.equal(first.status, 200); assert.deepEqual(JSON.parse(JSON.stringify(body.items.map(item => item.key))), [...f.keys].reverse());
  assert.equal((await f.put({ revision: body.revision, keys: f.keys })).status, 200); assert.deepEqual(JSON.parse(JSON.stringify(f.saved())), f.keys); assert.equal(f.writes(), 1);
});
test("stale revisions, foreign/duplicate identities and a competing write cannot silently overwrite order", async () => {
  const f = fixture(), { body } = await f.get(), revision = (body as { revision: string }).revision;
  assert.equal((await f.put({ revision: "0".repeat(64), keys: f.keys })).status, 409);
  assert.equal((await f.put({ revision, keys: [f.keys[0], f.keys[0]] })).status, 400);
  assert.equal((await f.put({ revision, keys: [f.keys[0], `programme:${"c".repeat(24)}`] })).status, 409); assert.equal(f.writes(), 0);
  f.race(); assert.equal((await f.put({ revision, keys: f.keys })).status, 409); assert.equal(f.saved(), null);
});
test("permission denial precedes all order reads and writes", async () => { const f = fixture(); f.deny(); assert.equal((await f.get()).status, 403); assert.equal((await f.put({})).status, 403); assert.equal(f.reads(), 0); assert.equal(f.writes(), 0); });
