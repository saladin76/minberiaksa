import * as requestPolicy from "../../lib/donations/subscription-request-policy";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const planId = "a".repeat(24), donorId = "b".repeat(24), requestId = "c".repeat(24);
function fixture() {
  const plan = { id: planId, donorId, amount: 100, currency: "EUR", status: "ACTIVE", nextBillingDate: new Date(Date.now() + 7 * 86400000), chargeAttempts: 0, amountChangeLock: null, items: [{ id: "item", amount: 100, amountUSD: 110 }], categoryItems: [], provider: "ALBARAKA", teamSupport: 0, coverFees: false };
  const donorRequest = { id: requestId, donorId, subscriptionId: planId, kind: "AMOUNT_CHANGE", requestedAmount: 10, currency: "EUR", status: "NEW", createdAt: new Date("2026-10-31T12:00:00Z"), activeKey: "private-dedup-key" };
  let writes = 0, lookups = 0, conversions = 0, allowed = true;
  const audits: Array<Record<string, unknown>> = [];
  const reads: Array<Record<string, unknown>> = [];
  const matches = (where: Record<string, unknown>) => ["id", "donorId", "subscriptionId"].every(key => !where[key] || where[key] === donorRequest[key as keyof typeof donorRequest]);
  const tx = { subscription: { updateMany: async () => { writes++; return { count: 1 }; } }, subscriptionItem: { update: async () => { writes++; } }, auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); } } };
  const prisma = {
    subscription: { findMany: async () => [plan], findUnique: async () => plan, updateMany: tx.subscription.updateMany },
    subscriptionServiceRequest: {
      findUnique: async () => { lookups++; return donorRequest; },
      findMany: async ({ where }: { where: Record<string, unknown> }) => { reads.push(where); return matches(where) ? [donorRequest] : []; },
      count: async ({ where }: { where: Record<string, unknown> }) => matches(where) ? 1 : 0,
    },
    user: { findMany: async () => [{ id: donorId, name: "Fixture donor" }] },
    $transaction: async (run: (db: typeof tx) => Promise<void>) => run(tx),
  };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin", name: "Fixture admin", role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => allowed ? null : Response.json({}, { status: 403 }) },
    "@/lib/prisma": { prisma },
    "@/lib/donations/recurring-lease": { billingLeaseAvailable: () => ({}) },
    "node:crypto": { randomUUID: () => "fixture-lock" },
    stripe: { default: class { constructor() { throw new Error("No bank/provider call is allowed in this fixture"); } } },
    "@/lib/donations/subscription-provider-control": { planRail: () => "ALBARAKA", ProviderSyncError: class extends Error {}, applyPlanStatusAtProvider: () => { throw new Error("Unexpected provider mutation"); } },
    "@/lib/exchange/convert-amount-in-currency-to-usd": { convertAmountInCurrencyToUsd: async (amount: number) => { conversions++; return amount * 1.1; } },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({ actorRole: "ADMIN" }) },
    "@/lib/donations/recurring-schedule": { nextChargeForPlan: () => { throw new Error("Schedule must not change"); } },
    "@/lib/donations/subscription-request-policy": requestPolicy,
    "@/lib/donations/subscription-requests": { notifySubscriptionRequest: () => { throw new Error("No recipient message is allowed"); } },
    "@/lib/events/after-response": { runAfterResponse: () => { throw new Error("No recipient notification is expected on a GET"); } },
  };
  function load(file: string) {
    const mod = { exports: {} as { PATCH: (request: Request, params: unknown) => Promise<Response>; GET: (request: unknown) => Promise<Response> } };
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, Date, console, process: { env: {} }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    return mod.exports;
  }
  const amount = load("app/api/admin/subscriptions/[id]/route.ts"), requests = load("app/api/admin/subscription-requests/route.ts");
  return { plan, donorRequest, audits, reads, deny: () => { allowed = false; }, stats: () => ({ writes, lookups, conversions }),
    patch: (overrides: Record<string, unknown> = {}) => amount.PATCH(new Request("https://fixture.test/api/admin/subscriptions/" + planId, { method: "PATCH", body: JSON.stringify({ amount: 10, consentMethod: "DONOR_REQUEST", consentRequestId: requestId, consentEvidence: "Forged client reference", ...overrides }) }), { params: Promise.resolve({ id: planId }) }),
    get: (params: string) => requests.GET({ nextUrl: new URL("https://fixture.test/api/admin/subscription-requests?" + params) }),
  };
}

test("a real donor request authorizes only its exact reduction and records server-owned evidence", async () => {
  const f = fixture();
  const response = await f.patch();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).amount, 10);
  assert.equal(f.audits.length, 1);
  const metadata = f.audits[0].metadata as Record<string, unknown>;
  assert.equal(metadata.consentMethod, "DONOR_REQUEST");
  assert.equal(metadata.consentRequestId, requestId);
  assert.match(String(metadata.consentEvidence), /2026-10-31T12:00:00\.000Z/);
  assert.match(String(metadata.consentEvidence), /10 EUR/);
  assert.doesNotMatch(String(metadata.consentEvidence), /Forged/);
});

test("another donor, plan, currency, amount, request kind or completed request cannot authorize billing", async () => {
  const variants = [{ donorId: "d".repeat(24) }, { subscriptionId: "d".repeat(24) }, { currency: "USD" }, { requestedAmount: 20 }, { kind: "CANCEL" }, { status: "COMPLETED" }];
  for (const variant of variants) {
    const f = fixture(); Object.assign(f.donorRequest, variant);
    assert.equal((await f.patch()).status, 409, JSON.stringify(variant));
    assert.deepEqual(f.stats(), { writes: 0, lookups: 1, conversions: 0 });
  }
});

test("request linkage cannot bypass operator permissions, billing windows, or the manual-consent contract", async () => {
  const denied = fixture(); denied.deny(); assert.equal((await denied.patch()).status, 403); assert.equal(denied.stats().writes, 0);
  const invalid = fixture(); assert.equal((await invalid.patch({ consentRequestId: "invalid" })).status, 400); assert.equal(invalid.stats().lookups, 0);
  const soon = fixture(); soon.plan.nextBillingDate = new Date(Date.now() + 3600000); assert.equal((await soon.patch()).status, 409); assert.equal(soon.stats().writes, 0);
  const manual = fixture(); assert.equal((await manual.patch({ consentMethod: "PHONE", consentEvidence: "" })).status, 400); assert.equal(manual.stats().writes, 0);
});

test("a two-decimal donor amount survives binary floating point, while a third decimal is rejected", async () => {
  const valid = fixture(); valid.donorRequest.requestedAmount = 1.15;
  assert.equal((await valid.patch({ amount: 1.15 })).status, 200);
  const invalid = fixture(); invalid.donorRequest.requestedAmount = 1.151;
  assert.equal((await invalid.patch({ amount: 1.151 })).status, 400);
  assert.equal(invalid.stats().writes, 0);
});

test("request reads retain donor and plan scope, include exact completed requests, and omit the private deduplication key", async () => {
  const f = fixture(); f.donorRequest.status = "COMPLETED";
  const response = await f.get(`userId=${donorId}&subscriptionId=${planId}&requestId=${requestId}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.requests[0].status, "COMPLETED"); assert.equal(data.requests[0].activeKey, undefined);
  assert.equal(f.reads[0].donorId, donorId); assert.equal(f.reads[0].subscriptionId, planId); assert.equal(f.reads[0].id, requestId);
  assert.equal((await (await f.get(`userId=${"d".repeat(24)}&subscriptionId=${planId}&requestId=${requestId}`)).json()).requests.length, 0);
  assert.equal((await f.get("requestId=malformed")).status, 400);
  assert.equal(f.stats().writes, 0);
});
