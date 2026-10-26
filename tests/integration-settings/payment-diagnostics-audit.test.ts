import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdtempSync, copyFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

type Row = ReturnType<typeof paypalRow>;
type Report = {
  readOnly: boolean; databaseWrites: number; paymentChargeCalls: number;
  paypalOrderReads: number; paypalAuthRequests: number;
  window: { truncated: boolean; rowsRead: number };
  albaraka: { byMode: Array<{ mode: string; confirmed: number; failed: number }>; codesRecoveredFromSale: number; missingRequestSnapshots: number; donorAccountRecovery: { laterConfirmedAccounts: number; later3DConfirmedAccounts: number; sameCardProven: boolean }; failureCodes: Array<{ code: string; attempts: number; uniqueDonors: number; repeatedAttemptsByKnownDonors: number; modes: Record<string, number>; currencyPairs: Record<string, number> }> };
  paypal: { providerCheck: string; confirmed: number; unconfirmed: number; unconfirmedOlderThan24Hours: number; unconfirmedWithoutOrder: number; renewalRowsExcludedFromProbes: number; checks: Array<{ verdict: string; orderStatus?: string; captureStatus?: string; pendingReason?: string; checks?: { currencyMatches: boolean } }> };
};
type Options = { db: ReturnType<typeof readOnlyDb>; env?: Record<string, string>; days?: number; rowLimit?: number; checkPayPal?: boolean; paypalLimit?: number; now?: Date; request?: (url: string, init?: RequestInit) => Promise<Response> };
type AuditModule = { auditPaymentDiagnostics(options: Options): Promise<Report>; parseAuditOptions(args: string[]): Record<string, unknown> };
// Keep the native ESM import when tsc compiles this test to CommonJS.
const nativeImport = new Function("url", "return import(url)") as (url: string) => Promise<AuditModule>;
const modulePromise = nativeImport(pathToFileURL(resolve("scripts/audit-payment-diagnostics.mjs")).href);
const now = new Date("2026-10-26T05:00:00Z");
const env = { PAYPAL_CLIENT_ID: "fixture-client-private", PAYPAL_CLIENT_SECRET: "fixture-secret-private" };

function paypalRow(id = "local-private-01", orderId: string | null = "ORDERPRIVATE001", extra: Record<string, unknown> = {}) {
  return {
    id, donorId: "donor-private-01", provider: "PAYPAL", paymentMethod: "PAYPAL", status: "PAID", paidAt: null,
    createdAt: new Date("2026-10-26T01:00:00Z"), paypalOrderId: orderId, paypalCaptureId: null, providerOrderId: orderId,
    providerProcReturnCode: null, providerErrorMessage: null, currency: "USD", billingReason: null,
    providerRaw: { paypalRequest: { orderId, value: "100.00", currency: "USD" } }, ...extra,
  };
}

function readOnlyDb(rows: Row[], inspect?: (query: { select: Record<string, boolean>; where: unknown; take: number }) => void) {
  return new Proxy({ donation: new Proxy({ findMany: async (query: { select: Record<string, boolean>; where: unknown; take: number }) => { inspect?.(query); return rows.slice(0, query.take); } }, {
    get(target, key: string) { if (key !== "findMany") throw new Error(`Database mutation or unrelated read: ${key}`); return target.findMany; },
  }) }, { get(target, key: string) { if (key !== "donation") throw new Error(`Forbidden database access: ${key}`); return target.donation; } });
}

function order(row: Row, orderStatus: string, captureStatus?: string, reason?: string) {
  return { id: row.paypalOrderId, status: orderStatus, payer: { email_address: "private-donor@example.test" }, purchase_units: [{
    custom_id: row.id,
    ...(captureStatus ? { payments: { captures: [{ id: "capture-private", status: captureStatus, amount: { value: "100.00", currency_code: "USD" }, status_details: { reason } }] } } : {}),
  }] };
}

test("payment audit only reads bounded fields and counts repeated bank attempts separately from donors", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  const failedBank = (donorId: string, code: string) => paypalRow("bank-private", null, {
    donorId, provider: "ALBARAKA", paymentMethod: "CARD", status: "FAILED", providerProcReturnCode: code,
    providerErrorMessage: "Fraud Şüphesi private-sensitive-message", providerRaw: { albarakaRequest: { mode: "2D", currencyCode: "TL", cardNo: "4111111111111111" } },
  });
  const rows = [failedBank("donor-one-private", "0059"), failedBank("donor-one-private", "59"), failedBank("donor-two-private", "59"), failedBank("donor-three-private", "1A"), paypalRow()];
  const report = await auditPaymentDiagnostics({ db: readOnlyDb(rows, query => {
    assert.equal(query.take, 5001);
    assert.equal(query.select.accessToken, undefined);
    assert.equal(query.select.donor, undefined);
    assert.equal(query.select.cardDetails, undefined);
  }), now, request: async () => { throw new Error("Unexpected provider call"); } });
  const fraud = report.albaraka.failureCodes.find(row => row.code === "59")!;
  assert.equal(fraud.attempts, 3); assert.equal(fraud.uniqueDonors, 2); assert.equal(fraud.repeatedAttemptsByKnownDonors, 1);
  assert.equal(fraud.modes["2D"], 3); assert.equal(fraud.currencyPairs["USD->TL"], 3);
  assert.equal(report.paypal.unconfirmed, 1); assert.equal(report.paypal.confirmed, 0);
  assert.equal(report.paypalOrderReads, 0); assert.equal(report.paypalAuthRequests, 0);
  assert.equal(report.databaseWrites, 0); assert.equal(report.paymentChargeCalls, 0);
  assert.doesNotMatch(JSON.stringify(report), /private|4111111111111111|ORDERPRIVATE001|Fraud Şüphesi/);
});

test("bank audit recovers nested decline codes and separates renewals from first 2D/3D attempts", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  const rows = [
    paypalRow("bank-a", null, { provider: "ALBARAKA", paymentMethod: "CARD", status: "FAILED", createdAt: new Date("2026-10-25T20:00:00Z"), providerRaw: { albarakaRequest: { mode: "2D", currencyCode: "TL" }, albarakaSale: { ServiceResponseData: { ResponseCode: "0059" } } } }),
    paypalRow("bank-b", null, { provider: "ALBARAKA", paymentMethod: "CARD", paidAt: now, providerRaw: { albarakaRequest: { mode: "3D", currencyCode: "TL" } } }),
    paypalRow("bank-c", null, { provider: "ALBARAKA", paymentMethod: "CARD", status: "FAILED", providerTxnType: "RecurringSale", providerRaw: { albarakaSale: { ServiceResponseData: { ResponseCode: "05", ResponseDescription: "private decline" } } } }),
  ];
  const report = await auditPaymentDiagnostics({ db: readOnlyDb(rows), now, request: async () => { throw new Error("No bank calls permitted"); } });
  assert.equal(report.albaraka.byMode.find(row => row.mode === "RECURRING_2D")?.failed, 1);
  assert.equal(report.albaraka.byMode.find(row => row.mode === "3D")?.confirmed, 1);
  assert.equal(report.albaraka.failureCodes.find(row => row.code === "05")?.attempts, 1);
  assert.equal(report.albaraka.failureCodes.find(row => row.code === "59")?.attempts, 1);
  assert.equal(report.albaraka.codesRecoveredFromSale, 2);
  assert.equal(report.albaraka.missingRequestSnapshots, 1);
  assert.equal(report.albaraka.donorAccountRecovery.laterConfirmedAccounts, 1);
  assert.equal(report.albaraka.donorAccountRecovery.later3DConfirmedAccounts, 1);
  assert.equal(report.albaraka.donorAccountRecovery.sameCardProven, false);
  assert.doesNotMatch(JSON.stringify(report), /donor-private|private decline|bank-a|bank-b|bank-c/);
});

test("PayPal audit distinguishes buyer approval, missing capture, provider holds and unrecorded completed capture without charging", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  const states = [
    ["CREATED", undefined, undefined, "awaiting_buyer_approval"],
    ["PAYER_ACTION_REQUIRED", undefined, undefined, "awaiting_buyer_approval"],
    ["APPROVED", undefined, undefined, "buyer_approved_capture_missing"],
    ["COMPLETED", "PENDING", "PENDING_REVIEW", "provider_capture_pending"],
    ["COMPLETED", "PENDING", "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION", "provider_capture_pending"],
    ["COMPLETED", "COMPLETED", undefined, "completed_not_recorded_locally"],
    ["COMPLETED", "DECLINED", undefined, "provider_capture_failed"],
    ["VOIDED", undefined, undefined, "provider_order_voided"],
  ];
  const rows = states.map((_, i) => paypalRow(`local-private-${i}`, `ORDERPRIVATE00${i}`));
  const requests: Array<{ url: string; method: string }> = [];
  const report = await auditPaymentDiagnostics({ db: readOnlyDb(rows), env, now, checkPayPal: true, request: async (url, init) => {
    requests.push({ url, method: init?.method ?? "GET" }); assert.equal(init?.redirect, "error");
    if (url.endsWith("/v1/oauth2/token")) { assert.equal(init?.method, "POST"); return Response.json({ access_token: "token-private" }); }
    assert.equal(init?.method, "GET"); assert.match(url, /^https:\/\/api-m\.paypal\.com\/v2\/checkout\/orders\/[A-Z0-9]+$/);
    const index = rows.findIndex(row => url.endsWith(row.paypalOrderId!));
    return Response.json(order(rows[index], states[index][0]!, states[index][1], states[index][2]));
  } });
  assert.deepEqual(report.paypal.checks.map(row => row.verdict), states.map(row => row[3]));
  assert.equal(report.paypal.checks[3].pendingReason, "PENDING_REVIEW");
  assert.equal(report.paypal.checks[4].pendingReason, "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION");
  assert.equal(requests.filter(row => row.method === "POST").length, 1);
  assert.equal(report.paypalOrderReads, 8); assert.equal(report.paymentChargeCalls, 0);
  assert.doesNotMatch(JSON.stringify(report), /token-private|fixture-secret|private-donor|local-private|ORDERPRIVATE|capture-private/);
});

test("completed money is flagged for integrity review if identity, amount, currency or capture count disagrees", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  for (const mismatch of ["id", "currency", "amount", "custom", "multiple", "missingSnapshot"]) {
    const row = paypalRow();
    const response = order(row, "COMPLETED", "COMPLETED");
    if (mismatch === "id") response.id = "OTHERORDER001";
    if (mismatch === "currency") response.purchase_units[0].payments!.captures[0].amount.currency_code = "EUR";
    if (mismatch === "amount") response.purchase_units[0].payments!.captures[0].amount.value = "1.00";
    if (mismatch === "custom") response.purchase_units[0].custom_id = "other-local-id";
    if (mismatch === "multiple") response.purchase_units[0].payments!.captures.push(response.purchase_units[0].payments!.captures[0]);
    if (mismatch === "missingSnapshot") Object.assign(row, { providerRaw: { paypalRequest: {} } });
    const report = await auditPaymentDiagnostics({ db: readOnlyDb([row]), env, now, checkPayPal: true, request: async url => Response.json(url.endsWith("/token") ? { access_token: "token-private" } : response) });
    assert.equal(report.paypal.checks[0].verdict, mismatch === "id" ? "order_identity_mismatch" : "completed_requires_integrity_review");
  }
});

test("only a bounded pending checkout sample is probed; paid, failed, missing-order and renewal rows cannot trigger calls", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  const rows = [paypalRow("paid", "ORDERPAID001", { paidAt: now }), paypalRow("failed", "ORDERFAILED01", { status: "FAILED" }), paypalRow("missing", null, { createdAt: new Date("2026-10-24T00:00:00Z") }), paypalRow("renewal", "ORDERRENEWAL01", { billingReason: "subscription_cycle" }), paypalRow("raw-renewal", "ORDERRENEWAL02", { providerRaw: { paypalRecurring: {} } }), paypalRow(), paypalRow("capture-known", "ORDERCAPTURE01", { paypalCaptureId: "capture-private" })];
  const urls: string[] = [];
  const report = await auditPaymentDiagnostics({ db: readOnlyDb(rows), env, now, checkPayPal: true, paypalLimit: 1, request: async url => {
    urls.push(url); return Response.json(url.endsWith("/token") ? { access_token: "token-private" } : order(rows[6], "COMPLETED", "PENDING", "ECHECK"));
  } });
  assert.equal(report.paypal.unconfirmedWithoutOrder, 1); assert.equal(report.paypal.unconfirmedOlderThan24Hours, 1);
  assert.equal(report.paypal.renewalRowsExcludedFromProbes, 2); assert.equal(report.paypalOrderReads, 1);
  assert.ok(urls[1].endsWith("ORDERCAPTURE01")); assert.equal(report.paypal.checks[0].pendingReason, "ECHECK");
  const truncated = await auditPaymentDiagnostics({ db: readOnlyDb(rows), rowLimit: 2, now });
  assert.equal(truncated.window.truncated, true); assert.equal(truncated.window.rowsRead, 2);
});

test("custom endpoints and invalid options are rejected before any provider access", async () => {
  const { auditPaymentDiagnostics, parseAuditOptions } = await modulePromise;
  let calls = 0;
  const report = await auditPaymentDiagnostics({ db: readOnlyDb([paypalRow()]), env: { ...env, PAYPAL_BASE_URL: "https://untrusted.example" }, checkPayPal: true, now, request: async () => { calls++; throw new Error("Must not call"); } });
  assert.equal(report.paypal.providerCheck, "custom_endpoint_not_probed"); assert.equal(calls, 0);
  assert.throws(() => parseAuditOptions(["--capture"])); assert.throws(() => parseAuditOptions(["--days", "x"]));
  await assert.rejects(auditPaymentDiagnostics({ db: readOnlyDb([]), days: 1000 }), /Invalid audit option/);
  await assert.rejects(auditPaymentDiagnostics({ db: readOnlyDb([]), paypalLimit: -1 }), /Invalid audit option/);
});

test("upstream errors and unknown statuses cannot leak raw messages or become proof of payment", async () => {
  const { auditPaymentDiagnostics } = await modulePromise;
  for (const status of [404, 429, 503]) {
    const report = await auditPaymentDiagnostics({ db: readOnlyDb([paypalRow()]), env, checkPayPal: true, now, request: async url => url.endsWith("/token") ? Response.json({ access_token: "token-private" }) : Response.json({ message: "private-sensitive-message", payer: "private-payer", status: "COMPLETED" }, { status }) });
    assert.equal(report.paypal.checks[0].verdict, "order_lookup_failed");
    assert.doesNotMatch(JSON.stringify(report), /private-sensitive|private-payer|token-private/);
  }
  const unknown = await auditPaymentDiagnostics({ db: readOnlyDb([paypalRow()]), env, checkPayPal: true, now, request: async url => Response.json(url.endsWith("/token") ? { access_token: "token-private" } : { id: "ORDERPRIVATE001", status: "private-status" }) });
  assert.equal(unknown.paypal.checks[0].verdict, "unresolved_provider_state"); assert.equal(unknown.paypal.checks[0].orderStatus, "UNKNOWN");
});

test("temporary-file CLI resolves application dependencies and fails without printing private exceptions", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "payment-audit-test-"));
  const script = resolve(dir, "audit.mjs");
  try {
    copyFileSync("scripts/audit-payment-diagnostics.mjs", script);
    const source = readFileSync(script, "utf8");
    assert.doesNotMatch(source, /reconcilePayPalDonation|capturePayPalOrder|albarakaService|dispatchEvent|\.donation\.(update|create|delete)/);
    const app = resolve(dir, "application");
    mkdirSync(resolve(app, "node_modules/@next/env"), { recursive: true });
    mkdirSync(resolve(app, "node_modules/@prisma/client"), { recursive: true });
    writeFileSync(resolve(app, "package.json"), "{}");
    writeFileSync(resolve(app, "node_modules/@next/env/index.js"), 'exports.loadEnvConfig = (cwd, dev) => { if(cwd !== process.cwd() || dev !== false) throw new Error("wrong environment"); };');
    writeFileSync(resolve(app, "node_modules/@prisma/client/index.js"), 'exports.PrismaClient = class { donation = { findMany: async () => [] }; async $disconnect() {} };');
    const report = JSON.parse(execFileSync(process.execPath, [script], { cwd: app, encoding: "utf8", stdio: "pipe" })) as Report;
    assert.equal(report.readOnly, true); assert.equal(report.window.rowsRead, 0); assert.equal(report.paypalOrderReads, 0);
    assert.throws(() => execFileSync(process.execPath, [script, "--unknown"], { cwd: dir, encoding: "utf8", stdio: "pipe" }), (error: unknown) => {
      assert.match(String((error as { stderr: string }).stderr), /Private details suppressed/); return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
