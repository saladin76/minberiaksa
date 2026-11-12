import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as nulls from "../../lib/donations/mongo-null";

type Row = Record<string, unknown>;
const now = new Date("2026-10-29T12:00:00Z");
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Row[]).every(item => matches(row, item));
    if (key === "OR") return (condition as Row[]).some(item => matches(row, item));
    if (key === "NOT") return !matches(row, condition as Row);
    const value = row[key];
    if (condition && typeof condition === "object") return Object.entries(condition).every(([op, target]) => op === "isSet" ? (value !== undefined) === target : op === "lt" ? Number(value) < Number(target) : op === "lte" ? Number(value) <= Number(target) : op === "gte" ? Number(value) >= Number(target) : op === "in" ? Array.isArray(target) && target.includes(value) : op === "not" ? value !== target : value === target);
    return value === condition;
  });
}
function fixture(options: { age?: number; state?: "approved" | "absent" | "unknown" | "throw"; dryRun?: boolean; provider?: string; legacy?: boolean; paidRace?: boolean; changedTerminal?: boolean; wrongAmount?: boolean; nextAt?: Date; lockUntil?: Date; missingPaidAt?: boolean; failed?: boolean; pendingState?: "Processing" | "PendingConfirmation" } = {}) {
  const request: Row = { orderId: "order", amount: 10000, currencyCode: "TL", mode: "2D", merchantNo: "merchant", terminalNo: options.changedTerminal ? "old-terminal" : "terminal" };
  if (options.legacy) { delete request.terminalNo; delete request.merchantNo; }
  const row: Row = { id: "111111111111111111111111", provider: options.provider ?? "ALBARAKA", providerOrderId: "order", paymentMethod: "CARD", status: options.failed ? "FAILED" : (options.pendingState ? "PENDING" : "PAID"), providerTxnResult: options.pendingState ?? null, paidAt: null, createdAt: new Date(now.getTime() - (options.age ?? 25) * 3_600_000), amountUSD: 10, providerRaw: { albarakaRequest: request }, items: [], categoryItems: [] };
  if (options.nextAt) row.reconciliationNextAt = options.nextAt;
  if (options.lockUntil) row.reconciliationLeaseUntil = options.lockUntil;
  if (options.missingPaidAt) delete row.paidAt;
  let inquiries = 0, settlements = 0, writes = 0;
  const prisma = { donation: {
    findMany: async (args: { where: Row }) => matches(row, args.where) ? [row] : [],
    updateMany: async (args: { where: Row; data: Row }) => { if (!matches(row, args.where)) return { count: 0 }; Object.assign(row, args.data); writes++; return { count: 1 }; },
  } };
  const cfg = { merchantNo: "merchant", terminalNo: "terminal" };
  const deps: Record<string, unknown> = {
    stripe: class {}, "node:crypto": crypto, "@/lib/payfor": { PAYFOR_UNVERIFIED_APPROVAL: "UNVERIFIED" }, "@/lib/prisma": { prisma }, "./mongo-null": nulls,
    "@/lib/events/after-response": {}, "@/lib/events/dispatch": {},
    "@/lib/donations/paypal-donation": { reconcilePayPalDonation: async () => { throw new Error("Unexpected PayPal call"); } },
    "@/lib/albaraka": { albarakaConfig: () => cfg, albaraka2DConfig: () => cfg, isAlbarakaConfigured: () => true,
      albarakaInquireSale: async () => { inquiries++; if (options.paidRace) row.paidAt = now; if (options.state === "throw") throw new Error("BANK_UNREACHABLE"); return options.state === "approved" ? { state: "approved", authCode: "AUTH", raw: { ServiceResponseData: { ResponseCode: "00" }, TransactionData: [{ TransactionType: "Sale", OrderId: "order", AuthCode: "AUTH", Amount: options.wrongAmount ? 1 : 10000, Currency: "TL" }] } } : { state: options.state ?? "absent", raw: {} }; },
    },
    "./albaraka-settlement": { settleAlbarakaDonation: async () => { settlements++; row.paidAt = now; return true; } },
  };
  const mod = { exports: {} as { reconcileUnconfirmedDonations: (opts: unknown) => Promise<{ scanned: number; credited: unknown[]; markedFailed: unknown[]; errors: unknown[] }> } };
  const source = ts.transpileModule(readFileSync("lib/donations/reconcile-unconfirmed.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, process: { env: {} }, Date, console: { error() {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return { row, run: () => mod.exports.reconcileUnconfirmedDonations({ now, dryRun: options.dryRun }), stats: () => ({ inquiries, settlements, writes }) };
}
test("half-hour polling recovers a confirmed bank sale through the existing settlement, including legacy missing paidAt", async () => {
  for (const missingPaidAt of [false, true]) {
    const f = fixture({ age: 1, state: "approved", missingPaidAt }); const result = await f.run();
    assert.equal(result.credited.length, 1); assert.equal(f.stats().inquiries, 1); assert.equal(f.stats().settlements, 1);
    assert.equal(new Date(f.row.reconciliationNextAt as Date).getTime(), now.getTime() + 1_800_000);
    assert.equal(f.row.reconciliationLeaseToken, null);
    await f.run(); assert.equal(f.stats().inquiries, 1);
  }
});
test("an approved Albaraka sale stuck in Processing or PendingConfirmation remains eligible for read-only bank inquiry", async () => {
  for (const pendingState of ["Processing", "PendingConfirmation"] as const) {
    const verified = fixture({ age: 1, state: "approved", pendingState });
    const out = await verified.run();
    assert.equal(out.credited.length, 1, pendingState);
    assert.equal(verified.stats().inquiries, 1);
    assert.equal(verified.stats().settlements, 1);
    assert.equal(verified.stats().writes, 2, "lease bookkeeping only, never a second sale request");
    const unknown = fixture({ age: 1, state: "unknown", pendingState });
    const unresolved = await unknown.run();
    assert.equal(unresolved.credited.length, 0);
    assert.equal(unresolved.markedFailed.length, 0);
    assert.equal(unknown.stats().settlements, 0);
  }
});

test("verified late Albaraka sale repairs previously FAILED payment through one idempotent settlement", async () => {
  const f = fixture({ age: 26, state: "approved", failed: true });
  const result = await f.run();
  assert.equal(result.credited.length, 1);
  assert.equal(f.stats().inquiries, 1);
  assert.equal(f.stats().settlements, 1);
  assert.ok(f.row.paidAt instanceof Date);
  await f.run();
  assert.equal(f.stats().settlements, 1, "already-paid payment must not settle twice");
});

test("bank no-sale, unknown or invalid evidence NEVER turns an already FAILED payment into PAID", async () => {
  for (const option of [
    { state: "absent" as const },
    { state: "unknown" as const },
    { state: "approved" as const, wrongAmount: true },
    { state: "approved" as const, changedTerminal: true },
  ]) {
    const f = fixture({ age: 48, failed: true, ...option });
    const r = await f.run();
    assert.equal(f.row.status, "FAILED");
    assert.equal(f.row.paidAt, null);
    assert.equal(f.stats().settlements, 0);
    assert.equal(r.credited.length, 0);
    assert.equal(r.markedFailed.length, 0);
  }
});

test("an authoritative no-sale at the same terminal becomes failed at 24 hours, not before", async () => {
  const young = fixture({ age: 23.99 }); assert.equal((await young.run()).markedFailed.length, 0); assert.equal(young.row.status, "PAID");
  const old = fixture({ age: 24 }); assert.equal((await old.run()).markedFailed.length, 1); assert.equal(old.row.status, "FAILED");
  assert.equal(old.row.providerTxnResult, "ConfirmationExpired"); assert.equal(old.stats().settlements, 0);
});
test("uncertain, unavailable or changed-terminal queries never manufacture an unpaid verdict", async () => {
  for (const option of [{ state: "unknown" as const }, { state: "throw" as const }, { legacy: true }, { changedTerminal: true }, { state: "approved" as const, wrongAmount: true }]) {
    const f = fixture(option); const result = await f.run(); assert.equal(result.markedFailed.length, 0); assert.equal(f.row.status, "PAID"); assert.equal(f.stats().settlements, 0);
  }
});
test("a concurrent confirmed webhook cannot be overwritten by the 24-hour expiry", async () => {
  const f = fixture({ paidRace: true }); const result = await f.run(); assert.equal(result.markedFailed.length, 0); assert.equal(f.row.status, "PAID"); assert.equal(f.row.paidAt, now);
});
test("dry-run, young rows, future checks, active leases and manual bank transfers never call a provider", async () => {
  for (const option of [{ dryRun: true }, { age: 0.1 }, { nextAt: new Date(now.getTime() + 1000) }, { lockUntil: new Date(now.getTime() + 1000) }, { provider: "BANK_TRANSFER" }]) {
    const f = fixture(option); await f.run(); assert.equal(f.stats().inquiries, 0); assert.equal(f.stats().writes, 0); assert.equal(f.row.status, "PAID");
  }
});

test("a browser failure cannot overwrite a pending bank inquiry or a concurrently paid donation", async () => {
  for (const result of ["Processing", "PendingConfirmation", "concurrent-paid"]) {
    let writes = 0, events = 0;
    const deps: Record<string, unknown> = {
      "next/server": { NextResponse: { json: (body: unknown) => Response.json(body) } },
      "@/lib/events/after-response": { runAfterResponse: (fn: () => unknown) => fn() },
      "@/lib/events/dispatch": { dispatchEvent: () => { events++; } },
      "@/lib/tracking/donation-conversion-server": { sendDonationFailedConversions: async () => {} },
      "@/lib/donations/mongo-null": nulls,
      "@/lib/prisma": { prisma: { donation: { findUnique: async () => ({ id: "fixture", status: "PAID", paidAt: null, providerTxnResult: result }), updateMany: async () => { writes++; return { count: 0 }; } } } },
    };
    const mod = { exports: {} as { PATCH: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> } };
    const code = ts.transpileModule(readFileSync("app/api/donations/[id]/fail/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, console: { error() {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
    const response = await mod.exports.PATCH(new Request("https://minberiaksa.org/api/donations/fixture/fail", { method: "PATCH", body: JSON.stringify({ reason: "Browser error" }) }), { params: Promise.resolve({ id: "fixture" }) });
    assert.equal(response.status, 200); assert.equal(events, 0); assert.equal(writes, result === "concurrent-paid" ? 1 : 0);
  }
});
