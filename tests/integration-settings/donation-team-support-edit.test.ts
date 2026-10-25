import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { donationEditTotals } from "../../lib/donations/edit-totals";

function harness(role = "ADMIN") {
  const before = { id: "gift", amount: 100, teamSupport: 10, fees: 3, coverFees: true, totalAmount: 113,
    amountUSD: 56.5, currency: "TRY", status: "PAID", paidAt: new Date("2026-01-01"), paymentMethod: "CARD",
    items: [{ campaignId: "project", amount: 100, amountUSD: 50 }], categoryItems: [], waqfItems: [] };
  const writes: Record<string, unknown>[] = [];
  type Audit = {metadata: {before: {teamSupport: number}; after: {teamSupport: number; totalAmount: number}}};
  const audits: Audit[] = [];
  const totals: string[] = [];
  const prisma = { donation: { findUnique: async () => before }, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    donation: { update: async ({ data }: {data: Record<string, unknown>}) => { writes.push(data); return data; } },
  }) };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: {status: number}) => ({ data, status: init?.status ?? 200 }) } },
    "@/lib/prisma": { prisma }, "next-auth": { getServerSession: async () => ({ user: { role } }) },
    "../../auth/[...nextauth]/options": { authOptions: {} }, "@prisma/client": {},
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => false }, "@/lib/dashboard/api-auth": {},
    "@/lib/exchange/convert-amount-in-currency-to-usd": { normalizeDonationCurrencyCode: (x: string) => x, convertAmountInCurrencyToUsd: async (value: number) => value / 2 },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorName: "Reviewer" }), writeAuditLog: async (entry: unknown) => audits.push(entry as Audit) },
    "@/lib/donations/edit-totals": { donationEditTotals },
    "@/lib/donations/reconcile-stripe-donation": {}, "@/lib/donations/paypal-donation": {},
    "@/lib/donations/access-token": {}, "@/lib/donations/subscription-provider-control": {},
    "@/lib/campaign/current-amount": { recomputeCampaignCurrentAmount: async (_tx: unknown, id: string) => totals.push(id) },
  };
  const loaded = { exports: {} as {PATCH: (request: {json: () => Promise<unknown>}, context: {params: Promise<{id: string}>}) => Promise<{status: number}>} };
  const code = ts.transpileModule(fs.readFileSync("app/api/donations/[id]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(code).runInNewContext({ exports: loaded.exports, module: loaded, Date, Map, Set, console,
    require: (id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`); return dependencies[id]; } });
  return { writes, audits, totals, patch: (body: unknown) => loaded.exports.PATCH({ json: async () => body }, { params: Promise.resolve({ id: "gift" }) }) };
}

test("editing support updates total and USD without rewriting project lines or charging a provider", async () => {
  const h = harness(); const result = await h.patch({ teamSupport: 25 });
  assert.equal(result.status, 200);
  assert.equal(h.writes[0].teamSupport, 25);
  assert.equal(h.writes[0].amount, 100);
  assert.equal(h.writes[0].totalAmount, 128);
  assert.equal(h.writes[0].amountUSD, 64);
  assert.equal(h.audits[0].metadata.before.teamSupport, 10);
  assert.equal(h.audits[0].metadata.after.teamSupport, 25);
  assert.equal(h.audits[0].metadata.after.totalAmount, 128);
});

test("support can be cleared and covered fees remain in the total", async () => {
  const h = harness(); assert.equal((await h.patch({ teamSupport: 0 })).status, 200);
  assert.equal(h.writes[0].totalAmount, 103);
  assert.equal(donationEditTotals(100, 0, 3, false).totalAmount, 100);
});

test("invalid support values and unauthorized roles never write financial data", async () => {
  for (const teamSupport of [-1, Infinity, NaN, "25", null, 1_000_000_001]) {
    const h = harness(); assert.equal((await h.patch({ teamSupport })).status, 400); assert.equal(h.writes.length, 0);
  }
  const h = harness("DONOR"); assert.equal((await h.patch({ teamSupport: 25 })).status, 403); assert.equal(h.writes.length, 0);
});
