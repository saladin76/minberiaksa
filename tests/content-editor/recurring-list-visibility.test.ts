import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
type Row = Record<string, unknown>;
function load(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (arg: unknown) => Promise<{ status: number; body: Row }>> };
  new vm.Script(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, URL, console: { error() {} }, require: (name: string) => dependencies[name] ?? {} });
  return loaded.exports;
}
function harness(role: "monthly" | "admin" | "donor") {
  const queries: Row[] = [];
  const status = load("lib/dashboard/donation-usd-revenue.ts", {});
  const route = load("app/api/donations/route.ts", {
    "next/server": { NextResponse: { json: (body: Row, init: { status?: number } = {}) => ({ body, status: init.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "own-id", role: role === "admin" ? "ADMIN" : "DONOR" } }) },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => role === "monthly" }, "@/lib/dashboard/api-auth": { isRevenueDashboardUser: () => role === "admin" },
    "@/lib/prisma": { prisma: { donation: { count: async (args: Row) => { queries.push(args); return 0; }, findMany: async (args: Row) => { queries.push(args); return []; } } } },
    "@/lib/dashboard/donation-usd-revenue": status,
    "@/lib/dashboard/donation-provider-filter": { donationProviderWhere: () => null },
    "@/lib/dashboard/recurring-frequency-filter": { parseFrequencyParam: () => null, donationFrequencyWhere: () => null, loadSubscriptionFrequencies: async () => () => null },
    "@/lib/dashboard/donation-relation-filters": { resolveDonationRelationFilterIds: async () => ({}) },
  });
  return { get: (query: string) => route.GET({ url: "https://example.invalid/api/donations?" + query }), queries };
}
test("recurring list forces settled payments even when a caller requests failed or pending rows", async () => {
  for (const role of ["monthly", "admin"] as const) {
    const h = harness(role); assert.equal((await h.get("subscriptionOnly=1&status=FAILED")).status, 200);
    const query = JSON.stringify(h.queries[0].where); assert.match(query, /"subscriptionId":\{"not":null\}/); assert.match(query, /"status":"PAID"/); assert.match(query, /"paidAt":\{"not":null\}/); assert.equal(query.includes("FAILED"), false);
  }
});
test("monthly-only staff cannot use the recurring permission to read the general donation list", async () => {
  const h = harness("monthly"); assert.equal((await h.get("")).status, 403); assert.equal(h.queries.length, 0);
});
test("donors cannot widen their own transaction history using recurring or donor filters", async () => {
  const h = harness("donor"); assert.equal((await h.get("subscriptionOnly=1&userId=another-user")).status, 200); assert.match(JSON.stringify(h.queries[0].where), /"donorId":"own-id"/); assert.equal(JSON.stringify(h.queries[0].where).includes("another-user"), false);
});
