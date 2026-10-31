import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { accountRevision, publicSearchAccount } from "../../lib/marketing/google-search/accounts";
import { searchAutomationPolicy } from "../../lib/marketing/google-search/contracts";
import { SearchApiError, searchCredentials } from "../../lib/marketing/google-search/client";
// Dynamic Prisma-shaped records are confined to this isolated route fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const id = "111111111111111111111111";
function harness() {
  let row: Row = { id, platform: "GOOGLE_ADS", name: "Paid account", accountId: "1234567890", managerAccountId: "", appId: "oauth-client", clientSecret: "TOP_SECRET_CLIENT", refreshToken: "TOP_SECRET_REFRESH", developerToken: "TOP_SECRET_DEVELOPER", enabled: true, status: "MISSING_CONFIG", lastTestAt: null, updatedAt: new Date("2026-10-29T00:00:00Z"), configChecklist: { googleAdsFundingType: "PAID", completionPercent: 80 } };
  const permissions = new Set(["platformConnections", "platformConnectionsManage", "platformConnectionsTest"]);
  let reads = 0, providerCalls = 0, conflict = false;
  const writes: Row[] = [], queries: string[] = [];
  const prisma = { marketingPlatformConnection: {
    findMany: async () => { reads++; return [row]; }, findFirst: async () => { reads++; return row; },
    updateMany: async ({ where, data }: Row) => { writes.push(data); if (where.updatedAt !== row.updatedAt) return { count: 0 }; row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1) }; return { count: 1 }; },
    create: async ({ data }: Row) => { row = { ...row, ...data }; writes.push(data); return { id }; },
  } };
  const dependencies: Row = {
    "next/server": { NextResponse: { json: (body: unknown, options: Row = {}) => ({ body, status: options.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id, role: "STAFF" } }) }, "zod": { z },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/prisma": { prisma },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_: unknown, permission: string) => permissions.has(permission) ? null : { status: 403 } },
    "@/lib/marketing/google-search/accounts": { accountRevision, publicSearchAccount },
    "@/lib/marketing/google-search/client": { SearchApiError, searchCredentials, googleSearchClient: async () => { providerCalls++; return { query: async (query: string) => { queries.push(query); if (conflict) row = { ...row, updatedAt: new Date(row.updatedAt.getTime() + 1) }; return [{ customer: { currencyCode: "USD", timeZone: "Europe/Istanbul" } }]; } }; } },
    "@/lib/audit-log": { queueAuditLog() {}, auditActorFromDashboardSession: () => ({ actorId: id }) },
  };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("app/api/admin/google-search/accounts/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, require: (key: string) => { if (!(key in dependencies)) throw new Error(key); return dependencies[key]; } });
  return { route: loaded.exports, row: () => row, permissions, state: () => ({ reads, providerCalls, writes, queries }), conflict: () => { conflict = true; }, save: (extra: Row = {}) => loaded.exports.POST({ json: async () => ({ action: "save", id, revision: accountRevision(row as never), name: "Grant account", customerId: "123-456-7890", managerId: "", clientId: "oauth-client", clientSecret: "", refreshToken: "", developerToken: "", fundingType: "AD_GRANTS", enabled: true, ...extra }) }), test: () => loaded.exports.POST({ json: async () => ({ action: "test", id, revision: accountRevision(row as never) }) }) };
}
test("account reads expose readiness and funding labels without returning credentials", async () => {
  const h = harness(), result = await h.route.GET();
  assert.equal(result.status, 200); assert.equal(result.body.accounts[0].ready, true);
  assert.equal(result.body.accounts[0].fundingType, "PAID"); assert.equal(JSON.stringify(result).includes("TOP_SECRET"), false);
});
test("blank credential fields preserve saved secrets; Ad Grants and paid connections stay distinct", async () => {
  const h = harness(); assert.equal((await h.save()).status, 200);
  assert.equal(h.row().clientSecret, "TOP_SECRET_CLIENT"); assert.equal(h.row().refreshToken, "TOP_SECRET_REFRESH");
  assert.equal(h.row().configChecklist.googleAdsFundingType, "AD_GRANTS"); assert.equal(h.row().configChecklist.completionPercent, 80);
  assert.equal(h.row().lastTestAt, null); assert.equal(h.state().providerCalls, 0);
  assert.equal((await h.save({ customerId: "0987654321" })).status, 409);
  assert.equal((await h.save({ revision: "0".repeat(64) })).status, 409);
});
test("save and test permissions are independent and enforced before credential reads", async () => {
  const h = harness(); h.permissions.delete("platformConnectionsManage"); assert.equal((await h.save()).status, 403); assert.equal(h.state().reads, 0);
  assert.equal((await h.test()).status, 200); assert.equal(h.state().providerCalls, 1);
  assert.equal(h.state().queries.length, 1); assert.match(h.state().queries[0], /^SELECT customer\.id, customer\.currency_code, customer\.time_zone FROM customer LIMIT 1$/);
  h.permissions.delete("platformConnectionsTest"); const before = h.state().reads; assert.equal((await h.test()).status, 403); assert.equal(h.state().reads, before);
});
test("a concurrent credential edit prevents an old read test from validating the new configuration", async () => {
  const h = harness(); h.conflict(); assert.equal((await h.test()).status, 409); assert.equal(h.row().status, "MISSING_CONFIG"); assert.equal(h.row().lastTestAt, null);
});
test("legacy accounts without a funding label are not guessed to be paid accounts", () => {
  const h = harness(); assert.equal(publicSearchAccount({ ...h.row(), configChecklist: null } as never).fundingType, "UNSPECIFIED");
});
test("plan history is queried for the selected customer connection before pagination", async () => {
  let queries = 0;
  const dependencies: Row = {
    "next/server": { NextResponse: { json: (body: unknown, options: Row = {}) => ({ body, status: options.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({}) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null }, "zod": { z },
    "@/lib/prisma": { prisma: { marketingPlatformConnection: { findMany: async () => [] }, campaign: { findMany: async () => [] }, googleSearchPlan: { findMany: async (args: Row) => { queries++; assert.equal(args.where.connectionId, id); assert.equal(args.take, 30); return [{ id: "plan", connectionId: id }]; } } } },
    "@/lib/campaign/soft-delete-filter": {}, "@/lib/marketing/google-search/client": {}, "@/lib/marketing/google-search/growth": {}, "@/lib/marketing/google-search/contracts": { searchAutomationPolicy }, "@/lib/events/after-response": {}, "@/lib/marketing/google-search/planner": {}, "@/lib/marketing/google-search/conversation": {}, "@/lib/marketing/google-search/executor": {}, "@/lib/marketing/google-ads-report": {}, "@/lib/marketing/google-search/revenue": {}, "@/lib/audit-log": {},
  };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("app/api/admin/google-search/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, require: (key: string) => { if (!(key in dependencies)) throw new Error(key); return dependencies[key]; } });
  assert.equal((await loaded.exports.GET({ nextUrl: new URL(`https://example.invalid/?connectionId=${id}`) })).body.plans[0].connectionId, id);
  assert.equal((await loaded.exports.GET({ nextUrl: new URL("https://example.invalid/?connectionId=invalid") })).status, 400); assert.equal(queries, 1);
});
