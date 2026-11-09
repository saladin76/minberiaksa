import { convertAmountInCurrencyToTry } from "../../lib/exchange/convert";
import { donationFieldEmpty, donationWhereAll } from "../../lib/donations/mongo-null";
import { frozenPaymentRoute } from "../../lib/donations/payment-routing";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import * as payfor from "../../lib/payfor";
import { withDonationToken } from "../../lib/donations/access-token-link";
import { isValidLocale } from "../../lib/locales";

const id = "111111111111111111111111";
const token = "test-token-not-a-production-donation";
type Env = Record<string, string | undefined>;

function load<T>(path: string, env: Env, modules: Record<string, unknown> = {}): T {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(source, {
    module: loadedModule, exports: loadedModule.exports, URL, Date, Number, Math,
    process: { env }, console: { log() {}, error() {} },
    require: (key: string) => { assert.ok(key in modules, "Unexpected dependency: " + key); return modules[key]; },
  });
  return loadedModule.exports as T;
}

function origin(env: Env) {
  return load<{ paymentPublicOrigin: (url: string) => string }>("lib/payment-public-origin.ts", env).paymentPublicOrigin;
}

for (const appUrl of [undefined, "", "http://localhost:3000", "https://localhost:3000", "https://127.0.0.1:3000", "https://[::1]:3000", "broken"]) {
  test(`production payment origin cannot inherit loopback (${String(appUrl)})`, () => {
    assert.equal(origin({ NODE_ENV: "production", APP_URL: appUrl })("https://localhost:3000/api/payfor/3dpay/ok"), "https://minberiaksa.org");
  });
}

test("configured public origin is normalized and wins over request or forwarded hosts", () => {
  assert.equal(origin({ NODE_ENV: "production", APP_URL: " https://payments.example.org/path/ " })("https://attacker.invalid"), "https://payments.example.org");
  assert.equal(origin({ NODE_ENV: "production", APP_URL: "https://user:password@bad.invalid", NEXT_PUBLIC_SITE_URL: "https://www.minberiaksa.org/" })("https://localhost:3000"), "https://www.minberiaksa.org");
});

test("only explicit local development or tests can return to localhost", () => {
  assert.equal(origin({ NODE_ENV: "development" })("http://localhost:3001/api/callback"), "http://localhost:3001");
  assert.equal(origin({ NODE_ENV: "test", APP_URL: "http://127.0.0.1:3002" })("http://localhost:3000"), "http://127.0.0.1:3002");
  assert.equal(origin({})("https://localhost:3000"), "https://minberiaksa.org");
});

function fixture(options: { env?: Env; paid?: boolean; verified?: boolean; throwRead?: boolean; currency?: string; totalAmount?: number; masterOff?: boolean; frozenGateway?: string; subscription?: boolean; ownedCard?: boolean } = {}) {
  const env: Env = { NODE_ENV: "production", PAYFOR_MERCHANT_PASS: "fixture-only", PAYFOR_3DPAY_URL: "https://bank.invalid/3d", PAYFOR_MBR_ID: "12", PAYFOR_MERCHANT_ID: "test", PAYFOR_USER_CODE: "test", PAYFOR_USER_PASS: "fixture-only", ...options.env };
  const state = { id, donorId: "222222222222222222222222", status: "PENDING", paidAt: options.paid ? new Date() : null, accessToken: token, totalAmount: options.totalAmount ?? 100, currency: options.currency ?? "TRY", subscriptionId: options.subscription ? "plan" : null, providerTxnResult: null as string | null, locale: "tr", providerOrderId: id, providerRaw: { ...(options.frozenGateway ? { paymentRouting: { version: 1, gateway: options.frozenGateway } } : {}), payforRequest: { purchAmount: "100.00" } }, items: [{ campaignId: "333333333333333333333333", amount: 100, amountUSD: 2 }], categoryItems: [] };
  const calls = { writes: 0, increments: 0 };
  const db = {
    donation: {
      async findUnique() { if (options.throwRead) throw new Error("fixture read failure"); return state; },
      async updateMany(args: { data: object }) { if (state.paidAt || state.providerTxnResult === "Processing") return { count: 0 }; calls.writes++; Object.assign(state, args.data); return { count: 1 }; },
      async update(args: { data: object }) { calls.writes++; Object.assign(state, args.data); return state; },
    },
    campaign: { async update() { calls.increments++; } }, category: { async update() { calls.increments++; } },
    creditCard: { async findUnique() { return { userId: state.donorId, cardNumber: "fixture-ciphertext", expiryDate: "12/39", cardholderName: "Fixture" }; } },
    globalSettings: { async findFirst() { return { payforEnabled: !options.masterOff }; } },
  };
  const modules = {
    "@/lib/donations/mongo-null": { donationFieldEmpty, donationWhereAll },
    "@/lib/donations/access-token-link": { withDonationToken },
    "@/lib/donations/payment-routing": { frozenPaymentRoute },
    "@/lib/site-security/payment-initiation-budget": { enforcePaymentInitiationBudget: async () => null },
    "@/lib/site-security/payfor-verified-decline": { recordSignedPayForDecline: async () => {} },

    crypto,
    "next/server": { after() {}, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init), redirect: (url: URL, status = 307) => new Response(null, { status, headers: { location: url.href } }) } },
    "@prisma/client": { Prisma: {} }, "@/lib/prisma": { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } },
    "@/lib/payment-public-origin": { paymentPublicOrigin: origin(env) },
    "@/lib/locales": { isValidLocale },
    "@/lib/donations/access-token": { withDonationToken },
    "@/lib/events/dispatch": { dispatchDonationPaid() {}, dispatchEvent() {} },
    "@/lib/events/after-response": { runAfterResponse() {} },
    "@/lib/tracking/donation-conversion-server": { sendDonationFailedConversions() {} },
    "@/lib/payfor": { ...payfor, verifyPayForResponseHash: () => options.verified !== false },
    "next-auth": { getServerSession: async () => options.ownedCard ? { user: { id: state.donorId } } : null }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/exchange/rates-service": { getUsdBaseRatesForServer: async () => ({ USD: 1, TRY: 50, EUR: 0.9, SAR: 3.75 }), convertAmountInCurrencyToTry },
    "@/lib/card-crypto": { decryptCard() { if (options.ownedCard) return "4111111111111111"; throw new Error("No card access expected"); } },
  };
  function handler(name: "ok" | "fail" | "initiate") {
    return load<{ POST: (request: Request) => Promise<Response> }>(`app/api/payfor/3dpay/${name}/route.ts`, env, modules).POST;
  }
  const request = (name: "ok" | "fail", code = "00", donorId = id) => new Request(`https://localhost:3000/api/payfor/3dpay/${name}?donationId=${donorId}&locale=tr`, {
    method: "POST", headers: { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "http" },
    body: new URLSearchParams({ OrderId: id, PurchAmount: "100.00", ProcReturnCode: code, TxnResult: code === "00" ? "Success" : "Failed" }),
  });
  return { handler, request, state, calls };
}

test("TRY initiation uses the same public success/failure origins included in the bank hash", async () => {
  const f = fixture();
  const response = await f.handler("initiate")(new Request("https://localhost:3000/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id, locale: "tr" }) }));
  assert.equal(response.status, 200);
  const { fields } = await response.json();
  assert.equal(fields.OkUrl, `https://minberiaksa.org/api/payfor/3dpay/ok?donationId=${id}&locale=tr`);
  assert.equal(fields.FailUrl, `https://minberiaksa.org/api/payfor/3dpay/fail?donationId=${id}&locale=tr`);
  assert.equal(fields.Currency, "949"); assert.equal(fields.PurchAmount, "100.00");
  assert.equal(fields.Hash, payfor.payForHash({ mbrId: fields.MbrId, orderId: fields.OrderId, purchAmount: fields.PurchAmount, okUrl: fields.OkUrl, failUrl: fields.FailUrl, txnType: fields.TxnType, installmentCount: fields.InstallmentCount, rnd: fields.Rnd, merchantPass: "fixture-only" }));
});

test("approved TRY callback behind the VPS returns a public GET success URL with the existing guest token", async () => {
  const f = fixture({ env: { APP_URL: "https://minberiaksa.org/" } });
  const response = await f.handler("ok")(f.request("ok"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `https://minberiaksa.org/tr/success/${id}?t=${token}`);
  assert.equal(f.state.status, "PAID"); assert.equal(f.state.currency, "TRY"); assert.equal(f.state.totalAmount, 100);
  assert.equal(f.calls.increments, 1);
  await f.handler("ok")(f.request("ok")); assert.equal(f.calls.increments, 1);
});

for (const name of ["ok", "fail"] as const) {
  test(`${name} callback never redirects to localhost when public configuration is absent`, async () => {
    const f = fixture(); const response = await f.handler(name)(f.request(name, "05"));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `https://minberiaksa.org/tr/donation-failed?donationId=${id}`);
    assert.equal(f.calls.increments, 0); assert.equal(f.state.status, "FAILED");
  });
  test(`${name} callback without a donation still returns a public GET failure page`, async () => {
    const f = fixture(); const response = await f.handler(name)(f.request(name, "05", ""));
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "https://minberiaksa.org/tr/donation-failed");
    assert.equal(f.calls.writes, 0);
  });
  test(`${name} callback error uses the public failure origin`, async () => {
    const f = fixture({ throwRead: true }); const response = await f.handler(name)(f.request(name));
    assert.equal(response.status, 303); assert.equal(new URL(response.headers.get("location")!).origin, "https://minberiaksa.org");
    assert.equal(f.calls.writes, 0);
  });
}

test("unverified approvals remain unconfirmed and never disclose the token or increment revenue", async () => {
  const f = fixture({ verified: false }); const response = await f.handler("ok")(f.request("ok"));
  assert.equal(response.status, 303); assert.equal(f.state.paidAt, null); assert.equal(f.state.status, "PENDING");
  assert.equal(f.calls.increments, 0); assert.ok(!response.headers.get("location")?.includes(token));
});

test("a late failure callback cannot undo a confirmed payment", async () => {
  const f = fixture({ paid: true }); const response = await f.handler("fail")(f.request("fail", "05"));
  assert.equal(response.status, 303); assert.equal(f.calls.writes, 0); assert.equal(f.calls.increments, 0);
});

for (const name of ["ok", "fail"] as const) test(`${name} callback cannot use a locale parameter to change the destination host`, async () => {
  const f = fixture();
  const request = new Request(`https://localhost:3000/api/payfor/3dpay/${name}?donationId=${id}&locale=${encodeURIComponent("//attacker.invalid")}`, {
    method: "POST", body: new URLSearchParams({ OrderId: id, PurchAmount: "100.00", ProcReturnCode: "00", TxnResult: "Success" }),
  });
  const response = await f.handler(name)(request);
  const destination = new URL(response.headers.get("location")!);
  assert.equal(response.status, 303); assert.equal(destination.origin, "https://minberiaksa.org");
  assert.ok(destination.pathname.startsWith("/en/"));
});

for (const [currency, amount, expected] of [["TRY", 1, "1.00"], ["USD", 1, "50.00"], ["EUR", 9, "500.00"], ["SAR", 3.75, "50.00"]] as const) test(`${currency}: PayFor signs the actual converted TRY amount and retains the donor amount`, async () => {
 const f = fixture({ currency, totalAmount: amount, frozenGateway: "PAYFOR" });
 const response = await f.handler("initiate")(new Request("https://minberiaksa.org/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id, locale: "tr" }) }));
 assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.fields.PurchAmount, expected); assert.equal(body.fields.Currency, "949"); assert.equal(body.fields.SecureType, "3DPay");
 assert.equal(f.state.currency, currency); assert.equal(f.state.totalAmount, amount);
 const snapshot = f.state.providerRaw.payforRequest as unknown as Record<string, unknown>; assert.equal(snapshot.originalAmount, amount); assert.equal(snapshot.originalCurrency, currency);
});
test("concurrent PayFor initiation returns only one bank form; later retries keep the result URL even after the master switch is disabled", async () => {
 const options = { frozenGateway: "PAYFOR", masterOff: false }; const f = fixture(options);
 const request = () => new Request("https://minberiaksa.org/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id }) });
 const results = await Promise.all([f.handler("initiate")(request()), f.handler("initiate")(request())]); const bodies = await Promise.all(results.map(r => r.json()));
 assert.equal(bodies.filter(body => body.fields?.Hash).length, 1); assert.equal(bodies.filter(body => body.method === "GET").length, 1); assert.equal(f.calls.writes, 1);
 options.masterOff = true; const retry = await (await f.handler("initiate")(request())).json(); assert.equal(retry.method, "GET"); assert.equal(retry.fields.Hash, undefined); assert.match(retry.actionUrl, /\/tr\/success\//); assert.equal(f.calls.writes, 1);
});
test("PayFor refuses another frozen gateway, recurring attempts, and a disabled master before initiating a new charge", async () => {
 for (const options of [{ frozenGateway: "ALBARAKA" }, { subscription: true }, { masterOff: true }]) {
  const f = fixture(options); const response = await f.handler("initiate")(new Request("https://minberiaksa.org/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id }) }));
  assert.ok([403, 409].includes(response.status)); assert.equal(f.calls.writes, 0);
 }
});

test("saved-card diagnostics derive the last four digits from the owned card, and an unauthenticated saved-card request never claims a payment", async () => {
 const owned = fixture({ ownedCard: true }); const response = await owned.handler("initiate")(new Request("https://minberiaksa.org/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id, savedCardId: "fixture-card", cardLast4: "9999" }) }));
 assert.equal(response.status, 200); assert.equal((owned.state.providerRaw as unknown as { cardSummary: { last4: string } }).cardSummary.last4, "1111"); assert.doesNotMatch(JSON.stringify(owned.state.providerRaw), /4111111111111111/);
 const guest = fixture(); const denied = await guest.handler("initiate")(new Request("https://minberiaksa.org/api/payfor/3dpay/initiate", { method: "POST", body: JSON.stringify({ donationId: id, savedCardId: "fixture-card" }) })); assert.equal(denied.status, 401); assert.equal(guest.calls.writes, 0);
});
