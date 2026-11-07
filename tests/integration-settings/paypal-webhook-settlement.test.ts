import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as nulls from "../../lib/donations/mongo-null";

function fixture(options: { pending?: boolean; changed?: string; failed?: boolean; racePaid?: boolean } = {}) {
  const row = { id: "donation", paypalOrderId: "ORDER1234567", providerOrderId: "ORDER1234567", paymentMethod: "PAYPAL", paidAt: null as Date | null, status: options.failed ? "FAILED" : "PAID", providerErrorMessage: null as string | null, accessToken: "fixture-private-token", createdAt: new Date("2020-01-01"), providerRaw: { paypalRequest: { orderId: "ORDER1234567", value: "25.00", currency: "USD" } }, items: [{ campaignId: "project", amountUSD: 25 }], categoryItems: [], subscriptionId: null };
  const capture = { id: "CAPTURE123", status: options.pending ? "PENDING" : "COMPLETED", amount: { value: "25.00", currency_code: "USD" }, status_details: { reason: "PENDING_REVIEW" } };
  const order = { id: row.paypalOrderId, status: "COMPLETED", purchase_units: [{ custom_id: row.id, payments: { captures: [capture] } }] };
  if (options.changed === "amount") capture.amount.value = "26.00";
  if (options.changed === "currency") capture.amount.currency_code = "EUR";
  if (options.changed === "owner") order.purchase_units[0].custom_id = "other-donation";
  if (options.changed === "order") order.id = "OTHERORDER";
  let credited = 0, paidEvents = 0, captures = 0, writes = 0;
  const donation = {
    findFirst: async () => structuredClone(row), findUnique: async () => structuredClone(row),
    update: async ({ data }: { data: Record<string, unknown> }) => { writes++; Object.assign(row, data); return row; },
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { if (options.racePaid) row.paidAt = new Date(); if (row.paidAt) return { count: 0 }; writes++; Object.assign(row, data); return { count: 1 }; },
  };
  const tx = { donation, campaign: { update: async ({ data }: { data: { currentAmount: { increment: number } } }) => { credited += data.currentAmount.increment; } } };
  let queue = Promise.resolve();
  const deps: Record<string, unknown> = {
    "server-only": {}, "./mongo-null": nulls,
    "@/lib/events/after-response": { runAfterResponse: (fn: () => unknown) => fn() },
    "@/lib/donations/recurring-schedule": {},
    "@/lib/events/dispatch": { dispatchDonationPaid: () => { paidEvents++; }, dispatchEvent: () => {} },
    "@/lib/tracking/donation-conversion-server": { sendDonationFailedConversions: async () => {} },
    "@/lib/prisma": { prisma: { donation, $transaction: (fn: (value: typeof tx) => Promise<unknown>) => { const result = queue.then(() => fn(tx)); queue = result.then(() => undefined); return result; } } },
    "@/lib/paypal": {
      isPayPalConfigured: () => true, getPayPalOrder: async () => order,
      capturePayPalOrder: async () => { captures++; throw new Error("A completed capture must never be captured again"); },
      paypalCaptureOf: (value: typeof order) => value.purchase_units[0].payments.captures[0], paypalAuditView: (value: typeof order) => ({ id: value.id }), paypalAmountsMatch: (a: string, b: string) => Number(a) === Number(b), paypalVaultOf: () => null,
    },
  };
  const mod = { exports: {} as { reconcilePayPalWebhookOrder: (orderId: string) => Promise<string> } };
  const source = ts.transpileModule(readFileSync("lib/donations/paypal-donation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, Date, console: { error() {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return { row, run: () => mod.exports.reconcilePayPalWebhookOrder("ORDER1234567"), stats: () => ({ credited, paidEvents, captures, writes }) };
}
test("a late completed PayPal webhook recovers an old local failure and concurrent deliveries credit once", async () => {
  const f = fixture({ failed: true }); const outcomes = await Promise.all([f.run(), f.run()]);
  assert.ok(outcomes.every(value => value === "paid")); assert.equal(f.row.status, "PAID"); assert.ok(f.row.paidAt);
  assert.deepEqual(f.stats(), { credited: 25, paidEvents: 1, captures: 0, writes: 1 });
  assert.equal(await f.run(), "ignored"); assert.equal(f.stats().credited, 25);
});
test("PayPal capture ownership, order, currency and amount are all checked before revenue is credited", async () => {
  for (const changed of ["amount", "currency", "owner", "order"]) {
    const f = fixture({ changed }); assert.equal(await f.run(), "failed"); assert.equal(f.stats().credited, 0); assert.equal(f.stats().paidEvents, 0); assert.equal(f.stats().captures, 0);
  }
});
test("pending PayPal review records the exact reason and remains uncredited even when old", async () => {
  const f = fixture({ pending: true }); assert.equal(await f.run(), "pending"); assert.equal(f.row.providerErrorMessage, "PayPal capture pending: PENDING_REVIEW"); assert.equal(f.row.paidAt, null); assert.equal(f.stats().credited, 0);
});
test("a concurrent paid confirmation cannot be replaced by a PayPal failure", async () => {
  const f = fixture({ changed: "amount", racePaid: true }); await f.run(); assert.equal(f.row.status, "PAID"); assert.ok(f.row.paidAt); assert.equal(f.stats().writes, 0);
});
