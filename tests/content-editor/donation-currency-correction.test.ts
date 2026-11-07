import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { donationEditTotals } from "../../lib/donations/edit-totals";
// Dynamic Prisma-shaped records are confined to this isolated route fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function harness() {
  let row: Row = { id: "111111111111111111111111", donorId: "222222222222222222222222", amount: 60, totalAmount: 65, teamSupport: 5, fees: 0, coverFees: false, amountUSD: 97.5, currency: "EUR", provider: "ALBARAKA", status: "PAID", paidAt: new Date(), paymentMethod: "CARD", items: [{ campaignId: "333333333333333333333333", amount: 10, amountUSD: 15, shareCount: 1 }], categoryItems: [{ categoryId: "444444444444444444444444", amount: 20, amountUSD: 30 }], waqfItems: [{ id: "555555555555555555555555", amount: 30, amountUSD: 45 }] };
  let conversions = 0, failFx = false, failWrite = false;
  const campaigns: number[] = [], categories: number[] = [];
  const tx = (draft: Row): Row => ({
    donation: { update: async ({ data }: Row) => { if (failWrite) throw new Error("Write failed"); Object.assign(draft, data); } },
    donationItem: { deleteMany: async () => { draft.items = []; }, createMany: async ({ data }: Row) => { draft.items = data; } },
    donationCategoryItem: { deleteMany: async () => { draft.categoryItems = []; }, createMany: async ({ data }: Row) => { draft.categoryItems = data; } },
    donationWaqfItem: { update: async ({ where, data }: Row) => { Object.assign(draft.waqfItems.find((item: Row) => item.id === where.id), data); } },
    current: draft,
  });
  const prisma = { donation: { findUnique: async () => row }, campaign: { count: async () => 1 }, category: { count: async () => 1 }, $transaction: async (fn: (value: Row) => Promise<unknown>) => { const draft = structuredClone(row); const result = await fn(tx(draft)); row = draft; return result; } };
  const dependencies: Row = {
    "@/lib/donations/edit-totals": { donationEditTotals }, "next/server": { NextResponse: { json: (body: unknown, options: Row = {}) => ({ body, status: options.status ?? 200 }) } }, "@/lib/prisma": { prisma },
    "next-auth": { getServerSession: async () => ({ user: { id: row.donorId, role: "ADMIN" } }) }, "../../auth/[...nextauth]/options": { authOptions: {} }, "@prisma/client": {},
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => true }, "@/lib/dashboard/api-auth": { isRevenueDashboardUser: () => true },
    "@/lib/exchange/convert-amount-in-currency-to-usd": { normalizeDonationCurrencyCode: (value: string) => value, convertAmountInCurrencyToUsd: async (amount: number, currency: string) => { conversions++; if (failFx) throw new Error("FX unavailable"); return amount * (currency === "USD" ? 1 : 2); } },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({ actorId: row.donorId }) },
    "@/lib/donations/reconcile-stripe-donation": {}, "@/lib/donations/paypal-donation": {}, "@/lib/donations/access-token": {}, "@/lib/donations/subscription-provider-control": {},
    "@/lib/campaign/current-amount": { recomputeCampaignCurrentAmount: async (context: Row) => campaigns.push(context.current.items.reduce((sum: number, item: Row) => sum + item.amountUSD, 0)), recomputeCategoryCurrentAmount: async (context: Row) => categories.push(context.current.categoryItems.reduce((sum: number, item: Row) => sum + item.amountUSD, 0)) },
  };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("app/api/donations/[id]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, console: { error() {} }, require: (key: string) => { if (!(key in dependencies)) throw new Error(key); return dependencies[key]; } });
  return { row: () => row, conversions: () => conversions, totals: () => ({ campaigns, categories }), fail: (key: string) => { if (key === "fx") failFx = true; if (key === "write") failWrite = true; }, patch: (body: Row) => loaded.exports.PATCH({ json: async () => body }, { params: Promise.resolve({ id: row.id }) }) };
}
test("currency correction reprices every project, category and waqf line and recomputes the ledger", async () => {
  const h = harness(); assert.equal((await h.patch({ currency: "USD", provider: "CASH" })).status, 200);
  assert.equal(h.row().amountUSD, 65); assert.equal(h.row().items[0].amountUSD, 10); assert.equal(h.row().categoryItems[0].amountUSD, 20); assert.equal(h.row().waqfItems[0].amountUSD, 30);
  assert.equal(h.row().items[0].shareCount, 1); assert.equal(h.row().provider, "CASH");
  assert.deepEqual(h.totals(), { campaigns: [10], categories: [20] });
});
test("provider-only edits and unchanged submitted lines preserve historical exchange values", async () => {
  const h = harness(); assert.equal((await h.patch({ provider: "STRIPE", items: h.row().items.map(({ campaignId, amount }: Row) => ({ campaignId, amount })), categoryItems: h.row().categoryItems.map(({ categoryId, amount }: Row) => ({ categoryId, amount })) })).status, 200);
  assert.equal(h.conversions(), 0); assert.equal(h.row().amountUSD, 97.5); assert.equal(h.row().items[0].amountUSD, 15);
});
test("invalid edits, exchange failures and transaction failures preserve the original payment", async () => {
  const invalid = harness(); assert.equal((await invalid.patch({ currency: "garbage" })).status, 400); assert.equal(invalid.conversions(), 0);
  for (const key of ["fx", "write"]) { const h = harness(); h.fail(key); assert.equal((await h.patch({ currency: "USD" })).status, 500); assert.equal(h.row().currency, "EUR"); assert.equal(h.row().waqfItems[0].amountUSD, 45); }
});
