import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { subscriptionPaymentSequence } from "../../lib/dashboard/subscription-payment-sequence";
import { accountingDateWhere, canUseAccountingDate } from "../../lib/dashboard/accounting-date-where";
import { dashboardDonationDateSortField } from "../../lib/dashboard/donation-ledger-date";
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
    "@/lib/dashboard/subscription-payment-sequence": { subscriptionPaymentSequence },
    "@/lib/dashboard/donation-financial-summary": { loadDonationFinancialSummaries: async () => new Map() },
    "next/server": { NextResponse: { json: (body: Row, init: { status?: number } = {}) => ({ body, status: init.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "own-id", role: role === "admin" ? "ADMIN" : "DONOR" } }) },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => role === "monthly" }, "@/lib/dashboard/api-auth": { isRevenueDashboardUser: () => role === "admin" },
    "@/lib/prisma": { prisma: { donation: { count: async (args: Row) => { queries.push(args); return 0; }, findMany: async (args: Row) => { queries.push(args); return []; } } } },
    "@/lib/dashboard/donation-usd-revenue": status,
    "@/lib/dashboard/donation-provider-filter": { donationProviderWhere: () => null },
    "@/lib/dashboard/recurring-frequency-filter": { parseFrequencyParam: () => null, donationFrequencyWhere: () => null, loadSubscriptionFrequencies: async () => () => null },
    "@/lib/dashboard/donation-relation-filters": { resolveDonationRelationFilterIds: async () => ({}) },
    "@/lib/dashboard/accounting-date-where": { accountingDateWhere, canUseAccountingDate },
    "@/lib/dashboard/donation-ledger-date": { dashboardDonationDateSortField },
  });
  return { get: (query: string) => route.GET({ url: "https://example.invalid/api/donations?" + query }), queries };
}
test("recurring list includes the requested attempt status without losing its subscription restriction", async () => {
  for (const role of ["monthly", "admin"] as const) {
    const h = harness(role); assert.equal((await h.get("subscriptionOnly=1&status=FAILED")).status, 200);
    const query = JSON.stringify(h.queries[0].where); assert.match(query, /"subscriptionId":\{"not":null\}/); assert.match(query, /"status":"FAILED"/); assert.equal(query.includes("PAID"), false);
  }
});
test("monthly-only staff cannot use the recurring permission to read the general donation list", async () => {
  const h = harness("monthly"); assert.equal((await h.get("")).status, 403); assert.equal(h.queries.length, 0);
});
test("donors cannot widen their own transaction history using recurring or donor filters", async () => {
  const h = harness("donor"); assert.equal((await h.get("subscriptionOnly=1&userId=another-user")).status, 200); assert.match(JSON.stringify(h.queries[0].where), /"donorId":"own-id"/); assert.equal(JSON.stringify(h.queries[0].where).includes("another-user"), false);
});

test("donor and staff primary list projections omit the private bank ledger, inquiry and lock", async () => {
  for (const role of ["donor", "monthly", "admin"] as const) {
    const h = harness(role); assert.equal((await h.get("subscriptionOnly=1")).status, 200);
    const omit = h.queries[1].omit as Record<string, unknown>;
    for (const key of ["bankOperations", "bankOperationLock", "bankOperationsRevision", "bankLastInquiry"]) assert.equal(omit?.[key], true, key);
  }
});
