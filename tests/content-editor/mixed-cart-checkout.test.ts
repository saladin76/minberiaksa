import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parseLocalAmount } from "../../lib/minbar/donation-amount";
import * as schedule from "../../lib/donations/recurring-schedule";
import * as mixed from "../../lib/donations/mixed-cart";
import * as handoff from "../../lib/minbar/payment-handoff";
import { donationListSafeFields } from "../../lib/dashboard/donation-list-privacy";

// Heterogeneous synthetic Prisma and Stripe payloads used only by fixture adapters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function load(path: string, imports: Row): Row {
  const fixture = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: fixture, exports: fixture.exports, Date, Intl, URL, URLSearchParams, Set, Map, console, process: { env: { STRIPE_SECRET_KEY: "sk_test_fixture" } },
    require: (name: string) => { if (!(name in imports)) throw Error("Unexpected import " + name); return imports[name]; },
  });
  return fixture.exports;
}
const campaign = "a".repeat(24), category = "b".repeat(24), donorId = "d".repeat(24);
function orderFixture() {
  const plans: Row[] = [], donations: Row[] = [];
  const db: Row = {
    globalSettings: { findFirst: async () => ({ teamSupportEnabled: true, allowAnyAmount: false, mainGateway: "ALBARAKA" }) },
    user: { findUnique: async () => ({ preferredLang: "ar" }) },
    campaign: { findMany: async ({ where }: Row) => [...new Set(where.id.in)].map(id => ({ id, isActive: true })) },
    category: { findMany: async ({ where }: Row) => [...new Set(where.id.in)].map(id => ({ id, isActive: true })) },
    subscription: { create: async ({ data }: Row) => { plans.push(data); return { id: "plan" + plans.length, ...data }; } },
    donation: { update: async ({ where, data }: Row) => Object.assign(donations.find(row => row.id === where.id)!, data), create: async ({ data }: Row) => { const row = { id: String(donations.length + 1).padStart(24, "0"), ...data }; donations.push(row); return row; } },
  };
  db.$transaction = async (callback: (client: Row) => unknown) => callback(db);
  const route = load("app/api/cart/payment/route.ts", {
    "@/lib/donations/mixed-cart": mixed,
    "@/lib/donations/payment-routing-server": { resolveNewCardPaymentRoute: async () => null },
    "@/lib/tracking/client-ip": { getTrackingClientIp: () => null },
    "next/server": { NextResponse: { json: (body: Row, init?: Row) => ({ body, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: donorId, name: "Fixture", role: "DONOR" } }) },
    "../../auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma: db },
    "@/lib/locales": { isValidLocale: () => true },
    "@/lib/referral-server": { resolveReferralId: async () => null },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => false },
    "@/lib/dashboard/donation-list-privacy": { donationListSafeFields },
    "@/lib/preferred-lang": { inferLocaleFromRequest: () => "ar" },
    "@/lib/attribution/sanitize": { sanitizeDonationAttribution: () => null },
    "@/lib/audit-log": { writeAuditLog: async () => {} },
    "@/lib/exchange/convert-amount-in-currency-to-usd": { normalizeDonationCurrencyCode: (v: string) => v, convertAmountInCurrencyToUsd: async (amount: number, currency: string) => currency === "TRY" ? amount / 50 : amount },
    "@/lib/donations/donor-country-code": { getDonorCountryCodeForSnapshot: async () => "TR", normalizeDonorCountryCode: () => null, countryCodeFromPhone: () => null },
    "@/lib/users/resolve-guest-donor": {},
    "@/lib/users/account-claim": {},
    "@/lib/donations/bank-transfer-claims": {},
    "@/lib/donations/bank-transfer-shared": { BANK_TRANSFER_PROVIDER: "BANK_TRANSFER" },
    "@/lib/minbar/cms": {},
    "@/lib/exchange/rates-service": { getUsdBaseRatesForServer: async () => ({ USD: 1, TRY: 50 }) },
    "@/lib/minbar/waqf": { WAQF_MAX_COUNT: 1000, WAQF_UNIT_PRICE_USD: { share: 20, meter: 100 }, isWaqfUnitKey: (v: string) => v === "share" || v === "meter" },
    "@/lib/minbar/donation-amount": { MIN_DONATION_USD: 1, MIN_DONATION_USD_TOLERANCE: .999, parseLocalAmount },
    "@/lib/donations/recurring-schedule": schedule,
    "@/lib/payment-gateway": { parseMainGateway: () => "ALBARAKA" },
    "@/lib/albaraka": { isAlbarakaRecurringCheckoutReady: () => true },
    "@/lib/paypal": { isPayPalRecurringEnabled: () => true, isPayPalConfigured: () => true },
    "@/lib/donations/access-token": { mintDonationAccessToken: () => "synthetic-access" },
    "@/lib/donations/gift-order": { parseGiftOrder: () => ({ ok: true, gift: null }), giftLineData: () => ({}) },
    "@/lib/ai/concierge/events": { recordConciergeEvents: async () => {} },
  });
  return { plans, donations, post: (body: Row) => route.POST({ headers: new Headers(), json: async () => ({ currency: "USD", paymentMethod: "CARD", locale: "ar", ...body }) }) };
}
test("one-time and multiple recurring cadences share checkout while retaining line frequencies", () => {
  for (const freqKey of ["daily", "friday", "monthly"] as const) assert.equal(schedule.cartHasMixedCadences([{ freqKey: "once" }, { freqKey }]), false);
  assert.equal(schedule.cartHasMixedCadences([{ freqKey: "daily" }, { freqKey: "monthly" }]), true);
  assert.deepEqual(mixed.checkoutLineFrequencies("MONTHLY", ["monthly", "daily"], 2), ["monthly", "daily"]);
  assert.throws(() => mixed.checkoutLineFrequencies("ONE_TIME", ["monthly"], 1), /MIXED_DONATION_FREQUENCIES/);
  assert.throws(() => mixed.checkoutLineFrequencies("MONTHLY", ["once"], 1), /MIXED_DONATION_FREQUENCIES/);
  assert.throws(() => mixed.checkoutLineFrequencies("MONTHLY", ["monthly"], 2), /MIXED_DONATION_FREQUENCIES/);
});
for (const type of ["DAILY", "FRIDAY", "MONTHLY"]) test("combined " + type + " initial payment stores only recurring campaign and category lines on the plan", async () => {
  const f = orderFixture(), cadence = type.toLowerCase();
  const response = await f.post({ type, items: [{ campaignId: campaign, amount: 10 }, { campaignId: campaign, amount: 5 }], categoryItems: [{ categoryId: category, amount: 7 }, { categoryId: category, amount: 3 }], lineFrequencies: ["once", cadence, "once", cadence] });
  assert.equal(response.status, 200);
  assert.equal(f.donations[0].totalAmount, 8);
  assert.equal(f.plans[0].amount, 8);
  assert.equal(f.donations.length, 2);
  assert.equal(f.donations[1].subscriptionId, null);
  assert.equal(f.donations[1].totalAmount, 17);
  assert.equal(f.donations[0].providerRaw.mixedCheckout.totalAmount, 25);
  assert.equal(f.donations[1].providerRaw.mixedCheckoutParentId, f.donations[0].id);
  assert.equal(f.donations[1].items.create[0].amount, 10);
  assert.equal(f.donations[1].categoryItems.create[0].amount, 7);
  assert.equal(f.plans[0].frequency, type);
  assert.equal(f.plans[0].items.create.length, 1);
  assert.equal(f.plans[0].items.create[0].amount, 5);
  assert.equal(f.plans[0].categoryItems.create.length, 1);
  assert.equal(f.plans[0].categoryItems.create[0].amount, 3);
  assert.equal(f.donations[0].items.create.length, 1);
  assert.equal(f.donations[0].categoryItems.create.length, 1);
});
test("one-time waqf keeps its certificate lines on the initial donation, not the recurring amount", async () => {
  const f = orderFixture();
  const response = await f.post({ type: "MONTHLY", items: [{ campaignId: campaign, amount: 5 }], waqfItems: [{ unit: "share", count: 2, donorName: "Fixture", onBehalf: "Fixture" }], lineFrequencies: ["monthly", "once"] });
  assert.equal(response.status, 200);
  assert.equal(f.donations[0].totalAmount, 5);
  assert.equal(f.plans[0].amount, 5);
  assert.equal(f.donations[1].waqfItems.create[0].amount, 40);
});
test("fees and optional team support use the initial and recurring principals separately", async () => {
  for (const teamSupportRecurring of [false, true]) {
    const f = orderFixture();
    const response = await f.post({ type: "MONTHLY", items: [{ campaignId: campaign, amount: 10 }, { campaignId: campaign, amount: 5 }], lineFrequencies: ["once", "monthly"], teamSupport: 2, teamSupportRecurring, coverFees: true });
    assert.equal(response.status, 200);
    assert.equal(Math.round(f.donations.reduce((sum, row) => sum + row.totalAmount, 0) * 100), 1751);
    assert.equal(f.plans[0].amount, 5);
    assert.equal(f.plans[0].teamSupport, teamSupportRecurring ? 2 : 0);
    assert.equal(f.plans[0].amountUSD, teamSupportRecurring ? 7.21 : 5.15);
  }
});
test("server currency conversion occurs before splitting the initial and recurring totals", async () => {
  const f = orderFixture();
  const response = await f.post({ type: "DAILY", currency: "TRY", amountsIn: "USD", items: [{ campaignId: campaign, amount: 10 }, { campaignId: campaign, amount: 5 }], lineFrequencies: ["once", "daily"] });
  assert.equal(response.status, 200);
  assert.equal(f.donations.reduce((sum, row) => sum + row.totalAmount, 0), 750);
  assert.equal(f.plans[0].amount, 250);
  assert.equal(f.plans[0].amountUSD, 5);
});
test("legacy homogeneous callers and one-time-only checkout keep their amounts", async () => {
  const recurring = orderFixture();
  assert.equal((await recurring.post({ type: "MONTHLY", items: [{ campaignId: campaign, amount: 15 }] })).status, 200);
  assert.equal(recurring.plans[0].amount, 15);
  const once = orderFixture();
  assert.equal((await once.post({ type: "ONE_TIME", items: [{ campaignId: campaign, amount: 15 }], lineFrequencies: ["once"] })).status, 200);
  assert.equal(once.plans.length, 0);
  assert.equal(once.donations[0].totalAmount, 15);
});
test("malformed cadence metadata and bank transfers with recurring rows are rejected before order writes", async () => {
  const f = orderFixture();
  assert.equal((await f.post({ type: "MONTHLY", items: [{ campaignId: campaign, amount: 15 }], lineFrequencies: ["daily"] })).status, 400);
  assert.equal((await f.post({ type: "MONTHLY", paymentMethod: "BANK_TRANSFER", items: [{ campaignId: campaign, amount: 15 }], lineFrequencies: ["monthly"] })).status, 400);
  assert.equal(f.plans.length, 0);
  assert.equal(f.donations.length, 0);
});
test("browser line frequencies follow serialized campaign/category/waqf order even when the basket is interleaved", () => {
  const checkout = load("lib/minbar/checkout.ts", {
    "./payment-handoff": handoff,
    "../donations/guest-access-client": {}, "@/lib/minbar/donation-amount": { lineLocal: () => null },
    "@/lib/donations/recurring-schedule": schedule, "@/lib/ai/concierge/client": {}, "@/lib/attribution/client-payload": {},
  });
  const result = checkout.toOrderItems([
    { categoryId: category, freqKey: "once", amount: 7 },
    { projectId: "campaign", freqKey: "monthly", amount: 5 },
    { waqf: { unit: "share", count: 1, donorName: "Fixture", onBehalf: "Fixture" }, freqKey: "once", amount: 20 },
  ], [{ id: campaign, slug: "campaign" }]);
  assert.equal(JSON.stringify(result.lineFrequencies), JSON.stringify(["monthly", "once", "once"]));
});

function stripeFixture(path: string, recurring = true) {
  const requests: Row[] = [];
  const donation = { id: "donation", donorId, currency: "USD", totalAmount: 15, status: "PAID", paidAt: null, items: [], categoryItems: [], donor: { id: donorId, email: "fixture@example.invalid", name: "Fixture" }, subscriptionId: recurring ? "plan" : null, subscription: recurring ? { id: "plan", amount: 5, teamSupport: 0, coverFees: false, frequency: "MONTHLY", provider: "STRIPE", timezone: "UTC", nextBillingDate: null, scheduleRule: null } : null };
  const db = { donation: { findUnique: async () => donation, update: async () => ({}) }, subscription: { update: async () => ({}) }, $transaction: async (promises: Promise<unknown>[]) => Promise.all(promises) };
  class StripeFixture {
    products = { create: async () => ({ id: "product" }) };
    customers = { search: async () => ({ data: [] }), create: async () => ({ id: "customer" }) };
    subscriptions = { create: async (request: Row) => { requests.push(request); return { id: "sub_fixture", latest_invoice: { id: "invoice", status: "open", confirmation_secret: { client_secret: "synthetic-secret" } } }; } };
    paymentIntents = { create: async (request: Row) => { requests.push(request); return { id: "intent", client_secret: "synthetic-secret" }; } };
    checkout = { sessions: { create: async (request: Row) => { requests.push(request); return { id: "session", url: "https://example.invalid/checkout" }; } } };
  }
  const route = load(path, {
    "@/lib/donations/payment-routing": { frozenPaymentRoute: () => null },
    "next/server": { NextResponse: { json: (body: Row, init?: Row) => ({ body, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: donorId } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma: db }, stripe: { default: StripeFixture },
    "@/lib/donations/access-token": { withDonationToken: (url: string) => url },
    "@/lib/donations/recurring-schedule": schedule,
    "@/lib/stripe-amount": { toStripeMinorUnits: (amount: number) => Math.round(amount * 100) },
  });
  return { requests, post: () => route.POST({ url: "https://example.invalid/api/stripe", json: async () => ({ donationId: "donation" }) }) };
}
test("Stripe subscription signup charges the combined total now and uses only the plan total at renewal", async () => {
  const f = stripeFixture("app/api/stripe/charge/route.ts");
  assert.equal((await f.post()).status, 200);
  assert.equal(f.requests[0].items[0].price_data.unit_amount, 500);
  assert.equal(f.requests[0].add_invoice_items[0].price_data.unit_amount, 1500);
  assert.ok(f.requests[0].trial_end);
});
test("Stripe hosted checkout separates recurring and first-invoice-only prices", async () => {
  const f = stripeFixture("app/api/stripe/checkout/route.ts");
  assert.equal((await f.post()).status, 200);
  assert.equal(f.requests[0].mode, "subscription");
  assert.equal(f.requests[0].line_items[0].price_data.unit_amount, 500);
  assert.equal(f.requests[0].line_items[1].price_data.unit_amount, 1000);
  assert.equal(f.requests[0].line_items[1].price_data.recurring, undefined);
  const once = stripeFixture("app/api/stripe/checkout/route.ts", false);
  assert.equal((await once.post()).status, 200);
  assert.equal(once.requests[0].mode, "payment");
  assert.equal(once.requests[0].line_items[0].price_data.unit_amount, 1500);
});
test("recurring baskets reject PayPal before creating either accounting record", async () => {
  const f = orderFixture();
  assert.equal((await f.post({ type: "MONTHLY", paymentMethod: "PAYPAL", items: [{ campaignId: campaign, amount: 10 }, { campaignId: campaign, amount: 5 }], lineFrequencies: ["once", "monthly"] })).status, 400);
  assert.equal(f.plans.length, 0); assert.equal(f.donations.length, 0);
});

for (const recurringSupport of [false, true]) test(`multi-cadence support and fees are allocated once (recurring=${recurringSupport})`, async () => {
  const f=orderFixture();
  const result=await f.post({type:"DAILY",items:[{campaignId:campaign,amount:1},{campaignId:campaign,amount:1},{campaignId:campaign,amount:1},{campaignId:campaign,amount:1}],lineFrequencies:["once","daily","friday","monthly"],teamSupport:3,teamSupportRecurring:recurringSupport,coverFees:true,schedules:{daily:{hour:8,minute:10},friday:{hour:12,minute:20},monthly:{hour:16,minute:30,dayOfMonth:15}}});
  assert.equal(result.status,200); assert.equal(f.donations.length,4); assert.equal(f.plans.length,3);
  assert.equal(Math.round(f.donations.reduce((sum,row)=>sum+row.totalAmount,0)*100),721);
  assert.equal(f.donations.reduce((sum,row)=>sum+row.teamSupport,0),3);
  assert.equal(f.plans.reduce((sum,row)=>sum+row.teamSupport,0),recurringSupport?3:0);
  assert.equal(f.donations.filter(row=>!row.subscriptionId).length,1);
  assert.deepEqual(f.plans.map(row=>row.scheduleRule.hour),[8,12,16]);
});
test("an invalid secondary cadence schedule is rejected before any donation/plan write",async()=>{
 const f=orderFixture();const result=await f.post({type:"DAILY",items:[{campaignId:campaign,amount:1},{campaignId:campaign,amount:1}],lineFrequencies:["daily","monthly"],schedules:{monthly:{hour:99,minute:0,dayOfMonth:15}}});
 assert.equal(result.status,400); assert.equal(f.donations.length,0);assert.equal(f.plans.length,0);
});


test("custom team support is charged as 500 TRY, never 500 USD, including recurring baskets", async () => {
  for (const cadence of ["once", "daily", "friday", "monthly"]) {
    const f = orderFixture();
    const response = await f.post({ type: cadence === "once" ? "ONE_TIME" : cadence.toUpperCase(), currency: "TRY", amountsIn: "USD",
      items: [{ campaignId: campaign, amount: 10 }], lineFrequencies: [cadence], teamSupport: 10,
      teamSupportLocal: { amount: 500, currency: "TRY" } });
    assert.equal(response.status, 200);
    assert.equal(f.donations[0].teamSupport, 500);
    assert.equal(f.donations[0].totalAmount, 1000);
    if (cadence !== "once") assert.equal(f.plans[0].teamSupport, 500);
  }
});

test("an exact support amount overrides a stale USD estimate and rejects malformed currency snapshots", async () => {
  const f = orderFixture();
  const response = await f.post({ currency: "TRY", amountsIn: "USD", type: "ONE_TIME", items: [{ campaignId: campaign, amount: 10 }], teamSupport: 500,
    teamSupportLocal: { amount: 500, currency: "TRY" } });
  assert.equal(response.status, 200);
  assert.equal(f.donations[0].totalAmount, 1000);
  const invalid = orderFixture();
  assert.equal((await invalid.post({ currency: "TRY", amountsIn: "USD", items: [{ campaignId: campaign, amount: 10 }], teamSupport: 10,
    teamSupportLocal: { amount: -500, currency: "TRY" } })).status, 400);
  assert.equal(invalid.donations.length, 0);
});


test("2500 TRY plus 500 TRY support charges exactly 3000 TRY and a changed total is rejected before order creation", async () => {
  const input = { currency: "TRY", amountsIn: "USD", type: "ONE_TIME", items: [{ campaignId: campaign, amount: 50, local: { amount: 2500, currency: "TRY" } }],
    teamSupport: 10, teamSupportLocal: { amount: 500, currency: "TRY" }, expectedTotal: 3000 };
  const f = orderFixture();
  assert.equal((await f.post(input)).status, 200);
  assert.equal(f.donations[0].totalAmount, 3000);
  const changed = orderFixture();
  const rejected = await changed.post({ ...input, expectedTotal: 1000 });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.code, "CHECKOUT_TOTAL_CHANGED");
  assert.equal(changed.donations.length, 0);
  assert.equal(changed.plans.length, 0);
});
