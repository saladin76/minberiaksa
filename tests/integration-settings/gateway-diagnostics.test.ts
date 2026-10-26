import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { gatewayDisplayAmounts, inspectPayPalCheckout } from "../../lib/donations/gateway-diagnostics";

const id = "507f1f77bcf86cd799439011";
const orderId = "ORDERFIXTURE001";
const donation = {
  id, provider: "PAYPAL", paymentMethod: "PAYPAL", paypalOrderId: orderId, providerOrderId: orderId,
  status: "PAID", paidAt: null, paidAmount: null, paidCurrency: null, currency: "USD", amount: 100, totalAmount: 100,
  amountUSD: 100, createdAt: new Date("2026-10-26T01:00:00Z"), billingReason: null,
  providerRaw: { paypalRequest: { orderId, value: "100.00", currency: "USD" } }, subscription: null,
  providerTxnType: "Capture", providerTxnResult: "Pending", providerProcReturnCode: null, providerErrorMessage: null,
  providerAuthCode: null, providerHostRefNum: null, paypalCaptureId: null,
};

function order(status: string, captureStatus?: string, reason?: string) {
  return { id: orderId, status, payer: { email: "private@example.test" }, purchase_units: [{ custom_id: id,
    ...(captureStatus ? { payments: { captures: [{ id: "private-capture-id", status: captureStatus, amount: { value: "100.00", currency_code: "USD" }, status_details: { reason } }] } } : {}),
  }] };
}

test("PayPal inspection distinguishes approval, provider holds and recorded capture through a read dependency only", async () => {
  for (const [status, capture, reason, expected] of [
    ["PAYER_ACTION_REQUIRED", undefined, undefined, "awaiting_buyer_action"],
    ["APPROVED", undefined, undefined, "approved_without_capture"],
    ["COMPLETED", "PENDING", "PENDING_REVIEW", "capture_pending"],
    ["COMPLETED", "PENDING", "ECHECK", "capture_pending"],
    ["COMPLETED", "COMPLETED", undefined, "completed_needs_reconciliation"],
    ["COMPLETED", "DECLINED", undefined, "capture_failed"],
    ["COMPLETED", "REFUNDED", undefined, "capture_refunded"],
    ["VOIDED", undefined, undefined, "order_voided"],
  ]) {
    let reads = 0;
    const result = await inspectPayPalCheckout(donation, { configured: true, readOrder: async reference => { assert.equal(reference, orderId); reads++; return order(status!, capture, reason); } });
    assert.equal(result.outcome, expected); assert.equal(result.readOnly, true); assert.equal(reads, 1);
    assert.doesNotMatch(JSON.stringify(result), /private@example|private-capture-id|ORDERFIXTURE|507f1f77/);
    if (capture === "PENDING") assert.equal(result.pendingReason, reason);
  }
});

test("404 and unavailable PayPal responses stay inconclusive and suppress raw error details", async () => {
  for (const status of [404, 401, 429, 503]) {
    const result = await inspectPayPalCheckout(donation, { configured: true, readOrder: async () => { throw Object.assign(new Error("private-sensitive-message"), { status, body: { payer: "private-payer" } }); } });
    assert.equal(result.outcome, status === 404 ? "order_not_found" : "provider_unavailable");
    assert.equal(result.httpStatus, status); assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("inspection never reads automatic renewals, missing references or unconfigured PayPal", async () => {
  const readOrder = async () => { throw new Error("Unexpected provider access"); };
  assert.equal((await inspectPayPalCheckout(donation, { configured: false, readOrder })).outcome, "not_configured");
  assert.equal((await inspectPayPalCheckout({ ...donation, billingReason: "subscription_cycle" }, { configured: true, readOrder })).outcome, "renewal_not_checked");
  assert.equal((await inspectPayPalCheckout({ ...donation, paypalOrderId: null, providerOrderId: null, providerRaw: {} }, { configured: true, readOrder })).outcome, "order_reference_missing");
});

test("mismatched order ownership cannot be presented as an approved or completed donation", async () => {
  for (const mismatch of ["id", "custom", "multiple"]) {
    const response = order("COMPLETED", "COMPLETED");
    if (mismatch === "id") response.id = "OTHERORDER001";
    if (mismatch === "custom") response.purchase_units[0].custom_id = "other-donation";
    if (mismatch === "multiple") response.purchase_units.push(response.purchase_units[0]);
    assert.equal((await inspectPayPalCheckout(donation, { configured: true, readOrder: async () => response })).outcome, "integrity_review");
  }
});

test("bank request currency conversion remains an attempted amount and never becomes confirmed money", () => {
  const failed = gatewayDisplayAmounts({ provider: "ALBARAKA", paidAt: null, paidAmount: 14931.09, paidCurrency: "TRY", providerRaw: { albarakaRequest: { amount: "1493109", currencyCode: "TL" } } });
  assert.equal(failed.requestedGatewayAmount, 14931.09); assert.equal(failed.requestedGatewayCurrency, "TRY");
  assert.equal(failed.paidAmount, null); assert.equal(failed.paidCurrency, null);
  const paidWithoutRecordedAmount = gatewayDisplayAmounts({ provider: "ALBARAKA", paidAt: new Date(), paidAmount: null, paidCurrency: null, providerRaw: { albarakaRequest: { amount: "1493109", currencyCode: "TL" } } });
  assert.equal(paidWithoutRecordedAmount.paidAmount, null); assert.equal(paidWithoutRecordedAmount.requestedGatewayAmount, 14931.09);
  const paid = gatewayDisplayAmounts({ ...donation, paidAt: new Date(), paidAmount: 100, paidCurrency: "USD" });
  assert.equal(paid.paidAmount, 100); assert.equal(paid.requestedGatewayAmount, 100);
});

function routeHarness({ session = { user: { role: "ADMIN" } } as unknown, allowed = true, row = donation as typeof donation | null } = {}) {
  const reads: string[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number; headers?: Record<string, string> }) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    "next-auth": { getServerSession: async () => session },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/permissions": { sessionHasDashboardPermission: () => allowed },
    "@/lib/donations/gateway-raw": { flattenGatewayRaw: () => ({ entries: [], truncated: false }) },
    "@/lib/donations/gateway-diagnostics": { gatewayDisplayAmounts, inspectPayPalCheckout },
    "@/lib/paypal": { isPayPalConfigured: () => true, getPayPalOrder: async () => { reads.push("paypal-order-get"); return order("APPROVED"); } },
    "@/lib/prisma": { prisma: { donation: new Proxy({ findUnique: async () => { reads.push("donation-get"); return row; } }, { get(target, key) { assert.equal(key, "findUnique", "Gateway inspection attempted a database mutation"); return target.findUnique; } }) } },
  };
  type Reply = { status: number; headers?: Record<string, string>; body: { paypalInspection?: { outcome: string }; paidAmount: number | null; requestedGatewayAmount: number | null } };
  const loaded = { exports: {} as { GET(request: unknown, context: { params: Promise<{ id: string }> }): Promise<Reply> } };
  const code = ts.transpileModule(readFileSync("app/api/admin/donations/[id]/gateway/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ exports: loaded.exports, module: loaded, console, Date, require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  return { reads, get: (reference = id) => loaded.exports.GET({}, { params: Promise.resolve({ id: reference }) }) };
}

test("authorized gateway GET reads an approved PayPal order without importing settlement or changing financial state", async () => {
  const h = routeHarness(); const reply = await h.get();
  assert.equal(reply.status, 200); assert.deepEqual(h.reads, ["donation-get", "paypal-order-get"]);
  assert.equal(reply.body.paypalInspection?.outcome, "approved_without_capture");
  assert.equal(reply.body.paidAmount, null); assert.equal(reply.body.requestedGatewayAmount, 100);
  assert.equal(reply.headers?.["Cache-Control"], "private, no-store");
});

test("gateway permissions and reference validation prevent every database and provider read before authorization", async () => {
  for (const [options, expected] of [[{ session: null }, 401], [{ allowed: false }, 403]] as const) {
    const h = routeHarness(options); assert.equal((await h.get()).status, expected); assert.equal(h.reads.length, 0);
  }
  const invalid = routeHarness(); assert.equal((await invalid.get("invalid")).status, 404); assert.equal(invalid.reads.length, 0);
  const missing = routeHarness({ row: null }); assert.equal((await missing.get()).status, 404); assert.deepEqual(missing.reads, ["donation-get"]);
  const confirmed = routeHarness({ row: { ...donation, paidAt: new Date() } as unknown as typeof donation });
  assert.equal((await confirmed.get()).status, 200); assert.deepEqual(confirmed.reads, ["donation-get"]);
});
