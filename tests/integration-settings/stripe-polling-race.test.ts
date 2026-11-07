import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as nulls from "../../lib/donations/mongo-null";

async function reconcile(state: string, racePaid = false) {
  const now = new Date("2026-10-29T12:00:00Z");
  const row = { id: "fixture", status: "PAID", provider: "STRIPE", providerOrderId: "pi_fixture", paidAt: null as Date | null, createdAt: new Date(now.getTime() - 90_000_000), amountUSD: 25, items: [{ campaignId: "project", amountUSD: 25 }], categoryItems: [] };
  let revenue = 0, events = 0, failures = 0;
  const prisma = {
    donation: { findMany: async () => [row], updateMany: async ({ data }: { data: Record<string, unknown> }) => { if (data.status === "FAILED") { if (racePaid) return { count: 0 }; failures++; } return { count: 1 }; } },
    $transaction: async (fn: (tx: unknown) => Promise<boolean>) => fn({ donation: { findUnique: async () => ({ paidAt: racePaid ? now : null }), update: async () => { row.paidAt = now; } }, campaign: { update: async ({ data }: { data: { currentAmount: { increment: number } } }) => { revenue += data.currentAmount.increment; } } }),
  };
  const deps: Record<string, unknown> = {
    stripe: class { paymentIntents = { retrieve: async () => ({ status: state, created: now.getTime() / 1000 }) }; },
    "node:crypto": crypto, "@/lib/prisma": { prisma }, "./mongo-null": nulls, "@/lib/albaraka": {}, "./albaraka-settlement": {}, "@/lib/payfor": { PAYFOR_UNVERIFIED_APPROVAL: "UNVERIFIED" }, "@/lib/donations/paypal-donation": {},
    "@/lib/events/after-response": { runAfterResponse: (fn: () => unknown) => fn() }, "@/lib/events/dispatch": { dispatchDonationPaid: () => { events++; } },
  };
  const mod = { exports: {} as { reconcileUnconfirmedDonations: (options: { now: Date }) => Promise<{ credited: unknown[]; markedFailed: unknown[] }> } };
  const code = ts.transpileModule(readFileSync("lib/donations/reconcile-unconfirmed.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, process: { env: { STRIPE_SECRET_KEY: "sk_test_fixture" } }, Date, console: { error() {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return { summary: await mod.exports.reconcileUnconfirmedDonations({ now }), revenue, events, failures };
}
test("recovered Stripe settlement counts revenue and dispatches success once; a concurrent webhook is not counted again", async () => {
  const fresh = await reconcile("succeeded"); assert.equal(fresh.revenue, 25); assert.equal(fresh.events, 1); assert.equal(fresh.summary.credited.length, 1);
  const raced = await reconcile("succeeded", true); assert.equal(raced.revenue, 0); assert.equal(raced.events, 0); assert.equal(raced.summary.credited.length, 0);
});
test("Stripe processing stays pending and a raced expiry is not falsely reported as a failed donation", async () => {
  const processing = await reconcile("processing"); assert.equal(processing.failures, 0); assert.equal(processing.summary.markedFailed.length, 0);
  const raced = await reconcile("canceled", true); assert.equal(raced.failures, 0); assert.equal(raced.summary.markedFailed.length, 0);
});
