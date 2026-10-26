import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import * as bank from "../../lib/albaraka";
import * as nulls from "../../lib/donations/mongo-null";
import { albarakaCheckoutMode } from "../../lib/donations/albaraka-checkout-mode";
import { albaraka3DLinkageError } from "../../lib/donations/albaraka-3d-verification";

const id = "111111111111111111111111", order = "0123456789ABCDEF0123";
const cfg: bank.AlbarakaConfig = { merchantNo: "900000001", terminalNo: "90000002", posnetId: "900000003", encKey: "test-key-never-live", tdsUrl: "https://bank.invalid/3d", serviceUrl: "https://bank.invalid/api", useOOS: false, useJokerVadaa: false };
const twoCfg = { ...cfg, terminalNo: "90000004" };
const pan = "4242424242424242";

function matches(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "AND") return (condition as Record<string, unknown>[]).every(item => matches(row, item));
    if (key === "OR") return (condition as Record<string, unknown>[]).some(item => matches(row, item));
    const value = row[key];
    if (condition && typeof condition === "object") return Object.entries(condition).every(([operation, target]) => operation === "not" ? value !== target : operation === "notIn" ? !(target as unknown[]).includes(value) : operation === "isSet" ? (value !== undefined) === target : value === target);
    return value === condition;
  });
}

function fixture(options: { fresh?: boolean; recurring?: boolean; outcome?: "approved" | "declined" | "transport" | "throw"; gate?: Promise<void>; settlementFails?: boolean } = {}) {
  const state: Record<string, unknown> = {
    id, donorId: "222222222222222222222222", status: "PAID", paidAt: null, accessToken: "test-guest-token",
    currency: "USD", totalAmount: 25, locale: "ar", provider: "ALBARAKA",
    providerOrderId: options.fresh ? null : order, providerTxnResult: options.fresh ? null : "Processing",
    providerRaw: options.fresh ? null : { albarakaRequest: { orderId: order, amount: 125000, currencyCode: "TL", transactionType: "Sale", mode: "3D" } },
    subscription: options.recurring ? { id: "333333333333333333333333", provider: "ALBARAKA", frequency: "DAILY", paymentCardId: "444444444444444444444444" } : null,
  };
  const calls = { sales: 0, mutations: 0, settles: 0, failures: 0, failureCode: "", cards: 0, saleBodies: [] as Record<string, unknown>[], terminals: [] as string[] };
  const prisma = {
    donation: {
      async findUnique() { return structuredClone(state); },
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        if (!matches(state, args.where)) return { count: 0 };
        calls.mutations++; Object.assign(state, structuredClone(args.data)); return { count: 1 };
      },
    },
    globalSettings: { async findFirst() { return { mainGateway: "ALBARAKA" }; } },
    creditCard: { async create() { calls.cards++; throw new Error("unexpected card storage"); } },
    subscription: { async update() { throw new Error("unexpected plan mutation"); } },
  };
  const bankAdapter = {
    ...bank, albarakaConfig: () => cfg, albaraka2DConfig: () => twoCfg,
    albarakaChargeCurrency: () => "TRY", isAlbarakaRecurringEnabled: () => true,
    async albarakaService(_operation: string, body: Record<string, unknown>, settings: { config: bank.AlbarakaConfig }) {
      calls.sales++; calls.saleBodies.push(body); calls.terminals.push(settings.config.terminalNo);
      if (options.gate) await options.gate;
      if (options.outcome === "throw") throw new Error("simulated lost bank response");
      if (options.outcome === "transport") return { TransportFailure: true, ServiceResponseData: { ResponseCode: "TRANSPORT", ResponseDescription: "Unreadable" } };
      if (options.outcome === "declined") return { ServiceResponseData: { ResponseCode: "59", ResponseDescription: "Fraud Şüphesi" } };
      return { ServiceResponseData: { ResponseCode: "00", ResponseDescription: "Approved" }, AuthCode: "TEST-AUTH" };
    },
    async albarakaInquireSale() { throw new Error("unexpected inquiry"); },
    async albarakaReverseSale() { throw new Error("unexpected reverse"); },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init), redirect: (url: URL, status: number) => new Response(null, { status, headers: { location: url.toString() } }) } },
    "next-auth": { getServerSession: async () => null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@prisma/client": { Prisma: {} }, "@/lib/prisma": { prisma }, crypto,
    "@/lib/albaraka": bankAdapter,
    "@/lib/donations/mongo-null": nulls,
    "@/lib/donations/albaraka-checkout-mode": { albarakaCheckoutMode },
    "@/lib/donations/albaraka-3d-verification": { albaraka3DLinkageError },
    "@/lib/locales": { isValidLocale: (locale: string) => ["ar", "en", "tr"].includes(locale) },
    "@/lib/donations/access-token": { withDonationToken: (path: string, token: string | null) => path + (token ? "?t=" + token : "") },
    "@/lib/payment-gateway": { parseMainGateway: (value: string) => value },
    "@/lib/security/card-attempts": { checkCardAttempt: async () => ({ ok: true }) },
    "@/lib/exchange/convert": { normalizeCurrencyCode: (currency: string) => currency },
    "@/lib/exchange/rates-service": { getUsdBaseRatesForServer: async () => ({}), convertAmountInCurrencyToTry: (amount: number) => amount * 50, convertAmountInCurrencyToUsd: (amount: number) => amount },
    "@/lib/card-crypto": { encryptCard: () => "encrypted-test", decryptCard: () => pan, detectCardType: () => "visa" },
    "@/lib/donations/albaraka-settlement": {
      async settleAlbarakaDonation() { calls.settles++; if (options.settlementFails) throw new Error("simulated database failure"); state.paidAt = new Date(); state.providerTxnResult = "Success"; return true; },
      async failAlbarakaDonation(_id: string, _reason: string, _extra: unknown, _orderId: string, code?: string) { calls.failures++; calls.failureCode = code || ""; state.status = "FAILED"; state.providerTxnResult = "Failed"; },
    },
  };
  function load(name: "initiate" | "callback") {
    const source = readFileSync(`app/api/albaraka/3d/${name}/route.ts`, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const loadedModule = { exports: {} };
    runInNewContext(compiled, { require: (key: string) => { if (!(key in modules)) throw new Error("Unexpected dependency: " + key); return modules[key]; }, module: loadedModule, exports: loadedModule.exports, process: { env: { APP_URL: "https://minber.test" } }, Buffer, URL, Date, Number, console: { log() {}, warn() {}, error() {} } });
    return (loadedModule.exports as { POST: (request: Request) => Promise<Response> }).POST;
  }
  const raw = (patch: Record<string, string> = {}) => {
    const values: Record<string, string> = { TranType: "Sale", OrderId: order, MerchantId: cfg.merchantNo, Amount: "125000", Currency: "TL", MdStatus: "1", SecureTransactionId: "test-secure-transaction", CAVV: "test-cavv", ECI: "05", MD: "test-md", ...patch };
    values.MacNew = bank.albarakaResponseMac(values, cfg.encKey); return values;
  };
  const callback = (values = raw()) => load("callback")(new Request(`https://minber.test/api/albaraka/3d/callback?donationId=${id}&locale=ar`, { method: "POST", body: new URLSearchParams(values) }));
  const initiate = (mode?: unknown) => load("initiate")(new Request("https://minber.test/api/albaraka/3d/initiate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ donationId: id, locale: "ar", ...(mode === undefined ? {} : { securityMode: mode }), card: { number: pan, expiry: "12/35", cvv: "123", holder: "Test Donor" } }) }));
  return { state, calls, raw, callback, initiate };
}

test("one-time 3D initiation returns a signed bank form without a Sale or storing card data", async () => {
  const f = fixture({ fresh: true }); const response = await f.initiate("3D"); const form = await response.json();
  assert.equal(response.status, 200); assert.equal(form.actionUrl, cfg.tdsUrl);
  assert.match(form.fields.OrderId, /^[A-F0-9]{20}$/);
  assert.equal(form.fields.Amount, "125000"); assert.equal(form.fields.CurrencyCode, "TL");
  assert.equal(form.fields.TerminalNo, cfg.terminalNo); assert.equal(form.fields.CardNo, pan);
  assert.equal(form.fields.MacNew, bank.albarakaFormMac(form.fields, cfg.encKey));
  assert.equal(f.calls.sales, 0); assert.equal(f.calls.cards, 0); assert.equal(f.calls.settles, 0);
  assert.ok(!JSON.stringify(f.state).includes(pan)); assert.equal(response.headers.get("cache-control"), "no-store");
});

for (const mode of [undefined, "2D"]) test(`2D initiation preserves the existing terminal, sale contract and settlement (${String(mode)})`, async () => {
  const f = fixture({ fresh: true }); const response = await f.initiate(mode); const result = await response.json();
  assert.equal(response.status, 200); assert.match(result.actionUrl, /\/api\/albaraka\/2d\/result/);
  assert.equal(f.calls.sales, 1); assert.equal(f.calls.settles, 1); assert.equal(f.calls.terminals[0], twoCfg.terminalNo);
  const body = f.calls.saleBodies[0]; assert.match(String(body.OrderId), /^[A-F0-9]{24}$/);
  assert.equal(body.IsTDSecureMerchant, "N"); assert.equal(body.IsMailOrder, "N"); assert.equal(body.ThreeDSecureData, null);
  assert.equal(body.MACParams, bank.ALBARAKA_NON_SECURE_MAC_PARAMS); assert.equal(body.CurrencyCode, "TL"); assert.equal(String(body.Amount), "125000");
});

test("a recurring checkout cannot enable 3D even if a client requests it", async () => {
  const f = fixture({ fresh: true, recurring: true }); const response = await f.initiate("3D");
  assert.equal(response.status, 200); assert.equal(f.calls.sales, 1); assert.equal(f.calls.terminals[0], twoCfg.terminalNo);
  assert.equal(f.calls.saleBodies[0].IsTDSecureMerchant, "N"); assert.equal(f.calls.cards, 0);
});

test("an invalid mode is rejected before claims or provider calls", async () => {
  const f = fixture({ fresh: true }); assert.equal((await f.initiate("invalid")).status, 400);
  assert.equal(f.calls.sales, 0); assert.equal(f.calls.mutations, 0);
});

test("a valid 3D callback captures once and a paid replay is read-only", async () => {
  const f = fixture(); const response = await f.callback();
  assert.equal(response.status, 303); assert.match(response.headers.get("location") || "", /\/success\//);
  assert.equal(f.calls.sales, 1); assert.equal(f.calls.settles, 1); assert.equal(f.calls.failures, 0);
  assert.equal(f.calls.saleBodies[0].IsTDSecureMerchant, "Y"); assert.equal(f.calls.terminals[0], cfg.terminalNo);
  await f.callback(); assert.equal(f.calls.sales, 1); assert.equal(f.calls.settles, 1);
});

test("two concurrent authentic callbacks can reach Sale only once", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const f = fixture({ gate }); const first = f.callback(), second = f.callback();
  await second; assert.equal(f.calls.sales, 1); assert.equal(f.calls.settles, 0);
  release(); await first; assert.equal(f.calls.sales, 1); assert.equal(f.calls.settles, 1);
});

test("invalid signatures or mismatched signed payment data never mutate, fail, capture, or disclose a token", async () => {
  for (const patch of ([{ TranType: "Auth" }, { Amount: "1" }, { Currency: "US" }, { MerchantId: "different" }, { OrderId: "" }, { OrderId: "F".repeat(20) }] as Record<string, string>[])) {
    const f = fixture(); const response = await f.callback(f.raw(patch));
    assert.equal(f.calls.sales, 0); assert.equal(f.calls.mutations, 0); assert.equal(f.calls.failures, 0);
    assert.ok(!(response.headers.get("location") || "").includes("test-guest-token"));
  }
  const f = fixture(); const response = await f.callback({ ...f.raw(), MacNew: "invalid" });
  assert.equal(f.calls.mutations, 0); assert.equal(f.calls.sales, 0); assert.equal(f.calls.failures, 0);
  assert.ok(!(response.headers.get("location") || "").includes("test-guest-token"));
});

test("a 2D request snapshot cannot be captured through the 3D callback", async () => {
  const f = fixture(); (f.state.providerRaw as { albarakaRequest: { mode: string } }).albarakaRequest.mode = "2D";
  await f.callback(); assert.equal(f.calls.sales, 0); assert.equal(f.calls.mutations, 0);
});

test("failed authentication never captures or silently downgrades and replays do not fail twice", async () => {
  const f = fixture(); await f.callback(f.raw({ MdStatus: "0" })); await f.callback(f.raw({ MdStatus: "0" }));
  assert.equal(f.calls.sales, 0); assert.equal(f.calls.failures, 1); assert.equal(f.state.status, "FAILED");
});

for (const outcome of ["throw", "transport"] as const) test(`uncertain 3D capture holds for confirmation instead of failing or recapturing (${outcome})`, async () => {
  const f = fixture({ outcome }); const response = await f.callback();
  assert.equal(f.calls.sales, 1); assert.equal(f.calls.failures, 0); assert.equal(f.state.paidAt, null);
  assert.equal(f.state.providerTxnResult, "Capturing3D"); assert.match(response.headers.get("location") || "", /\/success\//);
  await f.callback(); assert.equal(f.calls.sales, 1);
});

test("a recorded bank decline retains code59 without successful settlement", async () => {
  const f = fixture({ outcome: "declined" }); const response = await f.callback();
  assert.equal(f.calls.sales, 1); assert.equal(f.calls.failures, 1); assert.equal(f.calls.failureCode, "59");
  assert.equal(f.calls.settles, 0); assert.match(response.headers.get("location") || "", /donation-failed/);
});

test("a database failure after bank approval cannot mark the payment declined or recapture", async () => {
  const f = fixture({ settlementFails: true }); await f.callback(); await f.callback();
  assert.equal(f.calls.sales, 1); assert.equal(f.calls.failures, 0); assert.equal(f.state.paidAt, null); assert.equal(f.state.providerTxnResult, "Capturing3D");
});
