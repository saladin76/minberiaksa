import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as schedule from "../../lib/donations/recurring-schedule";
import * as albaraka from "../../lib/albaraka";
import * as clientIp from "../../lib/tracking/client-ip";
import * as gifts from "../../lib/donations/gift-order";
import { toStripeMinorUnits } from "../../lib/stripe-amount";

// A VM module boundary has no shared runtime type; all provider calls are replaced below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const signupAt = new Date("2026-10-25T07:00:00Z");
class Clock extends Date {
  constructor(value?: string | number | Date) { super(value ?? signupAt); }
  static now() { return signupAt.getTime(); }
}
function load<T = Row>(file: string, dependencies: Row, globals: Row = {}): T {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, Date: Clock, Map, Set, Buffer, URL, URLSearchParams, Request, console: { ...console, error() {} }, process: { env: { STRIPE_SECRET_KEY: "fixture" } },
    require: (name: string) => dependencies[name] ?? {}, fetch: () => { throw new Error("External payment calls are forbidden in this fixture"); }, ...globals });
  return loaded.exports as T;
}
const { parseMainGateway } = load("lib/payment-gateway.ts", { "@/lib/donations/recurring-schedule": schedule });
const next = { NextRequest: Request, NextResponse: { json: (data: unknown, options?: { status?: number }) => ({ data, status: options?.status ?? 200 }) } };
const request = (body: unknown) => new Request("https://fixture.invalid/api/cart/payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object") {
      if ("not" in expected) return row[key] != null;
      if ("lte" in expected) return row[key] != null && row[key] <= expected.lte;
    }
    return row[key] === expected;
  });
}
function fixture(mainGateway = "ALBARAKA") {
  let counter = 10, bankCalls = 0, increments = 0, ready = true;
  const plans = new Map<string, Row>(), donations = new Map<string, Row>();
  const id = () => String(counter++).padStart(24, "0");
  const prisma: Row = {
    globalSettings: { findFirst: async () => ({ mainGateway, teamSupportEnabled: true, allowAnyAmount: true }) },
    user: { findUnique: async () => ({ id: "donor", preferredLang: "ar", email: "fixture@example.invalid", name: "Fixture" }) },
    campaign: { findMany: async () => [{ id: "project", isActive: true }], update: async () => { increments++; } },
    category: { update: async () => { increments++; } },
    subscription: {
      create: async ({ data }: Row) => { const row = { id: id(), chargeAttempts: 0, paymentCardId: null, paypalVaultId: null, ...data, items: data.items?.create ?? [], categoryItems: data.categoryItems?.create ?? [] }; plans.set(row.id, row); return row; },
      update: async ({ where, data }: Row) => Object.assign(plans.get(where.id)!, data),
      findUnique: async ({ where }: Row) => plans.get(where.id),
      findMany: async ({ where }: Row) => {
        const { donations: relation, ...fields } = where;
        return [...plans.values()].filter(row => matches(row, fields) && (!relation?.some || [...donations.values()].some(donation => donation.subscriptionId === row.id && matches(donation, relation.some))));
      },
    },
    donation: {
      create: async ({ data }: Row) => { const row = { id: id(), paidAt: null, ...data, items: data.items?.create ?? [], categoryItems: data.categoryItems?.create ?? [] }; donations.set(row.id, row); return row; },
      update: async ({ where, data }: Row) => Object.assign(donations.get(where.id)!, data),
      findUnique: async ({ where }: Row) => donations.get(where.id),
      findFirst: async ({ where }: Row) => [...donations.values()].find(row => matches(row, where)),
    },
  };
  prisma.$transaction = async (operation: unknown) => typeof operation === "function" ? operation(prisma) : Promise.all(operation as Promise<unknown>[]);
  const dependencies: Row = {
    "@/lib/tracking/client-ip": clientIp,
    "server-only": {}, "next/server": next, "next-auth": { getServerSession: async () => ({ user: { id: "donor", role: "DONOR", name: "Fixture" } }) },
    "@/lib/prisma": { prisma }, "@/lib/locales": { isValidLocale: () => true },
    "@/lib/referral-server": { resolveReferralId: async () => null },
    "@/lib/attribution/sanitize": { sanitizeDonationAttribution: () => undefined },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditStreamForRole: () => "DONOR" },
    "@/lib/exchange/convert-amount-in-currency-to-usd": { normalizeDonationCurrencyCode: (value: string) => value, convertAmountInCurrencyToUsd: async (value: number) => value },
    "@/lib/exchange/rates-service": { getUsdBaseRatesForServer: async () => ({ USD: 1 }), convertAmountInCurrencyToUsd: (value: number) => value },
    "@/lib/donations/donor-country-code": { getDonorCountryCodeForSnapshot: async () => null },
    "@/lib/donations/recurring-schedule": schedule, "./recurring-schedule": schedule,
    "@/lib/payment-gateway": { parseMainGateway }, "@/lib/donations/gift-order": gifts,
    "@/lib/minbar/donation-amount": { parseLocalAmount: () => null },
    "@/lib/donations/access-token": { mintDonationAccessToken: () => "fixture-access" },
    "@/lib/events/after-response": { runAfterResponse: () => {} },
    "@/lib/tracking/donation-conversion-server": { sendDonationFailedConversions: async () => {} },
    "@/lib/card-crypto": { decryptCard: () => "5400619360964581" },
    "@/lib/albaraka": { ...albaraka, isAlbarakaRecurringCheckoutReady: () => ready, isAlbarakaRecurringEnabled: () => true,
      albarakaRecurringConfig: () => ({ merchantNo: "fixture", terminalNo: "fixture", encKey: "fixture-key", enabled: true }), albarakaChargeCurrency: () => "USD",
      albarakaService: async () => { bankCalls++; return { ServiceResponseData: { ResponseCode: "00" }, ReferenceCode: "fixture-ref" }; } },
    "@/lib/paypal": { isPayPalConfigured: () => true, isPayPalRecurringEnabled: () => true,
      paypalChargeFor: async (amount: number) => ({ value: amount.toFixed(2), currency: "USD" }),
      paypalAmountsMatch: (a: string, b: string) => a === b,
      paypalAuditView: (value: unknown) => value,
      paypalCaptureOf: (order: Row) => order.purchase_units[0].payments.captures[0],
      chargePayPalVault: async (input: Row) => { bankCalls++; return { id: "order", status: "COMPLETED", purchase_units: [{ custom_id: input.customId, payments: { captures: [{ id: "capture", status: "COMPLETED", amount: { value: input.value, currency_code: input.currency } }] } }] }; },
    },
  };
  const checkout = load("app/api/cart/payment/route.ts", dependencies);
  const driver = load("lib/minbar/checkout.ts", { ...dependencies,
    "../donations/guest-access-client": { rememberGuestDonationAccess: () => false },
    "@/lib/minbar/donation-amount": { lineLocal: () => null },
    "@/lib/ai/concierge/client": { readConciergeAssisted: () => null, readConciergeTouched: () => null },
    "@/lib/attribution/client-payload": { getDonationAttributionPayload: () => ({}) },
  }, { Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Europe/Istanbul" }) }) },
    fetch: async (url: string, input: RequestInit) => {
      assert.equal(url, "/api/cart/payment");
      const response = await checkout.POST(request(JSON.parse(String(input.body))));
      return { ok: response.status === 200, status: response.status, json: async () => response.data };
    } });
  const settlement = load("lib/donations/albaraka-settlement.ts", dependencies);
  const paypalSettlement = load("lib/donations/paypal-donation.ts", dependencies);
  dependencies["@/lib/donations/paypal-donation"] = paypalSettlement;
  return { plans, donations, prisma, dependencies, checkout, driver, settlement, paypalSettlement,
    albarakaWorker: load("lib/donations/albaraka-recurring.ts", dependencies), paypalWorker: load("lib/donations/paypal-recurring.ts", dependencies),
    calls: () => bankCalls, increments: () => increments, setReady: (value: boolean) => { ready = value; } };
}

for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"] as const) {
  for (const rail of ["ALBARAKA", "PAYPAL"] as const) {
    test(`${rail} ${frequency}: signup is unsettled, first payment activates the chosen schedule, and the due cycle runs once`, async () => {
      const f = fixture();
      const result = await f.driver.createDonation({ items: [{ projectId: "fixture-project", amount: 100, freqKey: frequency.toLowerCase(), schedule: { hour: 9, minute: 30, ...(frequency === "MONTHLY" ? { dayOfMonth: 15 } : {}) } }], projects: [{ id: "project", slug: "fixture-project" }], currency: "USD", locale: "ar", method: rail === "PAYPAL" ? "PAYPAL" : "CARD", guest: null, teamSupport: 20, teamSupportRecurring: false });
      const plan = f.plans.get(result.subscriptionId)!, donation = f.donations.get(result.id)!;
      assert.equal(plan.timezone, "Europe/Istanbul");
      assert.equal(plan.provider, rail); assert.equal(plan.frequency, frequency);
      assert.equal(plan.lastBillingDate, null); assert.equal(donation.paidAt, null);
      assert.equal(plan.teamSupport, 0); assert.equal(donation.totalAmount, 120);
      assert.equal(plan.amountUSD, 100); assert.equal(plan.consentSnapshot.amount, 100);
      assert.equal(plan.consentSnapshot.nextChargeAt, plan.nextBillingDate.toISOString());
      const worker = rail === "ALBARAKA" ? f.albarakaWorker.chargeDueAlbarakaSubscriptions : f.paypalWorker.chargeDuePayPalSubscriptions;
      if (rail === "ALBARAKA") Object.assign(plan, { paymentCardId: "card", paymentCard: { expiryDate: "12/29", cardNumber: "encrypted" } });
      else plan.paypalVaultId = "vault";
      const dueAt = new Date(plan.nextBillingDate);
      // An abandoned checkout must not be charged just because a card/vault was saved.
      const abandoned = await worker({ now: dueAt }); assert.equal(abandoned.scanned, 0); assert.equal(f.calls(), 0);
      // The old monthly endpoint stamped this optimistically before payment.
      // A legacy date is not proof of a settled first donation.
      plan.lastBillingDate = signupAt;
      const legacyUnpaid = await worker({ now: dueAt }); assert.equal(legacyUnpaid.scanned, 0); assert.equal(f.calls(), 0);
      plan.lastBillingDate = null;
      if (rail === "ALBARAKA") await f.settlement.settleAlbarakaDonation(donation.id, { ServiceResponseData: { ResponseCode: "00" } });
      else await f.paypalSettlement.settlePayPalDonation({ donationId: donation.id, orderId: "first", captureId: "first", paidAmount: 120, paidCurrency: "USD", audit: {}, vault: { id: "vault", customerId: null }, paidAt: signupAt });
      assert.equal(plan.status, "ACTIVE"); assert.ok(donation.paidAt); assert.ok(plan.lastBillingDate);
      const expectedNext = schedule.firstChargeForPlan({ frequency: plan.frequency, timezone: plan.timezone, scheduleRule: plan.scheduleRule }, signupAt);
      assert.equal(plan.nextBillingDate.toISOString(), expectedNext.toISOString());
      const firstRun = await worker({ now: dueAt }); assert.equal(firstRun.charged.length, 1); assert.equal(f.calls(), 1);
      assert.ok(plan.nextBillingDate > dueAt); assert.equal(f.increments(), 2);
      const secondRun = await worker({ now: dueAt }); assert.equal(secondRun.scanned, 0); assert.equal(f.calls(), 1);
    });
  }
}

test("unavailable recurring card checkout creates neither plan nor donation", async () => {
  const f = fixture(); f.setReady(false);
  const result = await f.checkout.POST(request({ items: [{ campaignId: "project", amount: 100 }], type: "DAILY", currency: "USD", paymentMethod: "CARD" }));
  assert.equal(result.status, 400); assert.equal(result.data.code, "RECURRING_UNAVAILABLE");
  assert.equal(f.plans.size, 0); assert.equal(f.donations.size, 0); assert.equal(f.calls(), 0);
});

for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"]) {
  test(`legacy donation endpoint delegates ${frequency} to the same recurring checkout`, async () => {
    let forwarded: unknown;
    const route = load("app/api/donations/route.ts", { "next/server": next, "@/lib/donations/recurring-schedule": schedule,
      "@/app/api/cart/payment/route": { POST: async (req: Request) => { forwarded = await req.json(); return { status: 200, data: { success: true } }; } } });
    const body = { type: frequency, items: [{ campaignId: "project", amount: 100 }], currency: "USD", paymentMethod: "CARD", timezone: "Europe/Istanbul", schedule: { hour: 9, minute: 30 } };
    const result = await route.POST(request(body)); assert.equal(result.status, 200); assert.deepEqual(forwarded, body);
  });
}

function stripeFixture(withSecret = true) {
  let creates = 0, retrieves = 0;
  const options: Array<[Row, Row]> = [];
  const plan: Row = { id: "plan", provider: "STRIPE", frequency: "MONTHLY", timezone: "Europe/Istanbul", amount: 100, teamSupport: 0, coverFees: false, nextBillingDate: new Date("2026-11-25T07:00:00Z") };
  const donation: Row = { id: "donation", donorId: "donor", donor: { id: "donor", email: null, name: null }, subscription: plan, currency: "USD", totalAmount: 120, status: "PAID", paidAt: null, items: [], categoryItems: [], createdAt: signupAt };
  const subscription: Row = { id: "sub_fixture", latest_invoice: { id: "in_fixture", status: "open", ...(withSecret ? { confirmation_secret: { client_secret: "fixture-confirmation" } } : {}) } };
  class Stripe {
    customers = { search: async () => ({ data: [{ id: "cus_fixture" }] }) };
    products = { create: async () => ({ id: "prod_fixture" }) };
    subscriptions = { create: async (input: Row, config: Row) => { creates++; options.push([input, config]); return subscription; }, retrieve: async (_id: string, input: Row) => { retrieves++; assert.equal(input.expand[0], "latest_invoice.confirmation_secret"); return subscription; } };
  }
  const route = load("app/api/stripe/charge/route.ts", { "next/server": next, "next-auth": { getServerSession: async () => ({ user: { id: "donor" } }) }, stripe: Stripe,
    "@/lib/stripe-amount": { toStripeMinorUnits }, "@/lib/donations/recurring-schedule": schedule,
    "@/lib/prisma": { prisma: { donation: { findUnique: async () => donation, update: async ({ data }: Row) => Object.assign(donation, data) }, subscription: { update: async ({ data }: Row) => Object.assign(plan, data) }, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } } });
  return { route, plan, donation, subscription, options, creates: () => creates, retrieves: () => retrieves };
}

test("monthly Stripe signup uses the current confirmation secret, persists linkage and reuses the subscription", async () => {
  const f = stripeFixture();
  const first = await f.route.POST(request({ donationId: "donation" })); assert.equal(first.status, 200); assert.equal(first.data.clientSecret, "fixture-confirmation");
  assert.equal(f.options[0][0].expand[0], "latest_invoice.confirmation_secret"); assert.equal(f.options[0][1].idempotencyKey, "recurring-signup-plan");
  assert.equal(f.options[0][0].items[0].price_data.unit_amount, 10000); assert.equal(f.options[0][0].add_invoice_items[0].price_data.unit_amount, 12000);
  assert.equal(f.plan.stripeSubscriptionId, "sub_fixture"); assert.equal(f.donation.providerOrderId, "in_fixture");
  const again = await f.route.POST(request({ donationId: "donation" })); assert.equal(again.status, 200); assert.equal(f.creates(), 1); assert.equal(f.retrieves(), 1);
  f.subscription.latest_invoice.status = "paid";
  const paid = await f.route.POST(request({ donationId: "donation" })); assert.equal(paid.status, 409); assert.equal(f.creates(), 1);
});

test("a missing Stripe secret retains the external subscription link so retry cannot create another plan", async () => {
  const f = stripeFixture(false);
  const first = await f.route.POST(request({ donationId: "donation" })); assert.equal(first.status, 500);
  assert.equal(f.plan.stripeSubscriptionId, "sub_fixture"); assert.equal(f.donation.providerOrderId, "in_fixture");
  const retry = await f.route.POST(request({ donationId: "donation" })); assert.equal(retry.status, 409); assert.equal(f.creates(), 1);
});

test("one scheduler provider throwing does not stop the other provider", async () => {
  let paypalCalls = 0;
  const empty = { charged: [], failed: [], skipped: [], scanned: 0, enabled: true, dryRun: false };
  const route = load("app/api/cron/recurring-charges/route.ts", { "next/server": next, "@/lib/communication/cron-auth": { isCronAuthorizationValid: () => true },
    "@/lib/donations/albaraka-recurring": { chargeDueAlbarakaSubscriptions: async () => { throw new Error("fixture provider error"); } },
    "@/lib/donations/paypal-recurring": { chargeDuePayPalSubscriptions: async () => { paypalCalls++; return empty; } },
    "@/lib/audit-log": { writeAuditLog: async () => {} } });
  const req = { headers: new Headers(), nextUrl: new URL("https://fixture.invalid/api/cron/recurring-charges?dryRun=1") };
  const result = await route.GET(req); assert.equal(paypalCalls, 1); assert.equal(result.status, 500); assert.equal(result.data.ok, false); assert.equal(result.data.paypal.scanned, 0);
});

for (const mismatch of ["ALBARAKA", "DAILY", "FRIDAY"]) {
  test(`Stripe refuses a plan assigned to ${mismatch} without creating an external subscription`, async () => {
    const f = stripeFixture();
    if (mismatch === "ALBARAKA") f.plan.provider = mismatch; else f.plan.frequency = mismatch;
    const result = await f.route.POST(request({ donationId: "donation" }));
    assert.equal(result.status, 400); assert.equal(f.creates(), 0);
  });
}

test("the browser checkout driver preserves the recurring-unavailable code without creating an order", async () => {
  const f = fixture(); f.setReady(false);
  await assert.rejects(() => f.driver.createDonation({ items: [{ projectId: "fixture-project", amount: 100, freqKey: "friday" }], projects: [{ id: "project", slug: "fixture-project" }], currency: "USD", method: "CARD", guest: null, locale: "ar", teamSupport: 0, teamSupportRecurring: true }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "RECURRING_UNAVAILABLE"); return true;
  });
  assert.equal(f.plans.size, 0); assert.equal(f.calls(), 0);
});
