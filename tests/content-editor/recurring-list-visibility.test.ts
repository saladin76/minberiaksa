import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { subscriptionPaymentSequence } from "../../lib/dashboard/subscription-payment-sequence";
import { accountingDateWhere, canUseAccountingDate } from "../../lib/dashboard/accounting-date-where";
import { dashboardDonationDateSortField } from "../../lib/dashboard/donation-ledger-date";
import { dashboardLocaleWhere, dashboardCountryWhere } from "../../lib/dashboard/donation-location-scope";
import { PRIVATE_DONATION_LIST_KEYS, donationListSafeFields } from "../../lib/dashboard/donation-list-privacy";
import { donationPaymentEvidence } from "../../lib/donations/payment-evidence";
import { donorAccountStatus } from "../../lib/dashboard/donor-account";
import { istanbulDateKeysToUtcRange } from "../../lib/admin/istanbul-calendar";
type Row = Record<string, unknown>;
function load(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (arg: unknown) => Promise<{ status: number; body: Row }>> };
  new vm.Script(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, URL, console: { error() {} }, require: (name: string) => dependencies[name] ?? {} });
  return loaded.exports;
}
function harness(role: "monthly" | "admin" | "donor" | "revenue", fixtures: Row[] = []) {
  const queries: Row[] = [];
  const status = load("lib/dashboard/donation-usd-revenue.ts", {});
  const route = load("app/api/donations/route.ts", {
    "@/lib/dashboard/subscription-payment-sequence": { subscriptionPaymentSequence },
    "@/lib/dashboard/donation-financial-summary": { loadDonationFinancialSummaries: async () => new Map() },
    "next/server": { NextResponse: { json: (body: Row, init: { status?: number } = {}) => ({ body, status: init.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "own-id", role: role === "admin" ? "ADMIN" : role === "revenue" || role === "monthly" ? "STAFF" : "DONOR" } }) },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => role === "monthly" }, "@/lib/dashboard/api-auth": { isRevenueDashboardUser: () => role === "admin" || role === "revenue" },
    "@/lib/prisma": { prisma: { donation: { count: async (args: Row) => { queries.push(args); return fixtures.length; }, findMany: async (args: Row) => { queries.push(args); return fixtures; } } } },
    "@/lib/dashboard/donation-usd-revenue": status,
    "@/lib/dashboard/donation-provider-filter": { donationProviderWhere: () => null },
    "@/lib/dashboard/recurring-frequency-filter": { parseFrequencyParam: () => null, donationFrequencyWhere: () => null, loadSubscriptionFrequencies: async () => () => null },
    "@/lib/dashboard/donation-relation-filters": { resolveDonationRelationFilterIds: async () => ({}) },
    "@/lib/dashboard/accounting-date-where": { accountingDateWhere, canUseAccountingDate },
    "@/lib/admin/istanbul-calendar": { istanbulDateKeysToUtcRange },
    "@/lib/dashboard/donation-ledger-date": { dashboardDonationDateSortField },
    "@/lib/dashboard/donation-location-scope": { dashboardLocaleWhere, dashboardCountryWhere },
    "@/lib/dashboard/donation-list-privacy": { donationListSafeFields },
    "@/lib/donations/payment-evidence": { donationPaymentEvidence },
    "@/lib/dashboard/donor-account": { donorAccountStatus },
  });
  return { get: (query: string) => route.GET({ url: "https://example.invalid/api/donations?" + query }), queries };
}
test("recurring list includes the requested attempt status without losing its subscription restriction", async () => {
  for (const role of ["monthly", "admin"] as const) {
    const h = harness(role); assert.equal((await h.get("subscriptionOnly=1&status=FAILED")).status, 200);
    const query = JSON.stringify(h.queries[0].where); assert.match(query, /"subscriptionId":\{"not":null\}/); assert.match(query, /"status":"FAILED"/); assert.equal(query.includes("PAID"), false);
  }
});
test("monthly-only staff cannot use the recurring permission to read the general donation list", async () => {
  const h = harness("monthly"); assert.equal((await h.get("")).status, 403); assert.equal(h.queries.length, 0);
});
test("donors cannot widen their own transaction history using recurring or donor filters", async () => {
  const h = harness("donor"); assert.equal((await h.get("subscriptionOnly=1&userId=another-user")).status, 200); assert.match(JSON.stringify(h.queries[0].where), /"donorId":"own-id"/); assert.equal(JSON.stringify(h.queries[0].where).includes("another-user"), false);
});

test("donor and staff primary list projections omit the private bank ledger, inquiry and lock", async () => {
  for (const role of ["donor", "monthly", "admin"] as const) {
    const h = harness(role); assert.equal((await h.get("subscriptionOnly=1")).status, 200);
    const omit = h.queries[1].omit as Record<string, unknown>;
    for (const key of PRIVATE_DONATION_LIST_KEYS) {
      // The raw provider response powers server-side securityMode; attribution
      // and conversion timing power the revenue-only source badge. All are
      // stripped/sanitized at serialization for callers without revenue access.
      if (["providerRaw", "attribution", "conversionEventsSentAt", "conversionFailedEventsSentAt"].includes(key)) continue;
      assert.equal(omit?.[key], true, key);
    }
    for (const key of ["providerRaw", "attribution", "conversionEventsSentAt", "conversionFailedEventsSentAt"]) {
      assert.equal(omit?.[key], undefined, key);
    }

  }
});

test("accounting mode is honored for revenue STAFF and ADMIN with settled date sorting", async () => {
  for (const role of ["revenue", "admin"] as const) {
    const h = harness(role);
    const response = await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=PAID");
    assert.equal(response.status, 200, role);
    const query = JSON.stringify(h.queries[0].where);
    assert.match(query, /"paidAt":\{"gte":/);
    assert.equal(query.includes('"createdAt":{'), false);
    assert.equal(JSON.stringify(h.queries[1].orderBy), '[{"paidAt":"desc"},{"id":"desc"}]');
  }
});

test("donor cannot request another donor or switch accounting date basis", async () => {
  const h = harness("donor");
  const response = await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=PAID&userId=someone-else");
  assert.equal(response.status, 200);
  const where = JSON.stringify(h.queries[0].where);
  assert.match(where, /"donorId":"own-id"/);
  assert.equal(where.includes("someone-else"), false);
  assert.equal(where.includes('"paidAt":{'), false);
  assert.match(where, /"createdAt":\{"gte":/);
  assert.equal(JSON.stringify(h.queries[1].orderBy), '{"createdAt":"desc"}');
});

test("monthly-only staff cannot use accounting mode to read general donation ledger", async () => {
  const h = harness("monthly");
  const response = await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=PAID");
  assert.equal(response.status, 403);
  assert.equal(h.queries.length, 0);
});

test("accounting mode with incomplete date window falls back to legacy createdAt", async () => {
  const h = harness("revenue");
  const response = await h.get("dateBasis=accounting&start=2026-11-10&status=PAID");
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(h.queries[1].orderBy), '{"createdAt":"desc"}');
});

test("all-status accounting GET includes settled, failed and pending date arms", async () => {
  const h = harness("revenue");
  const response = await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=all");
  assert.equal(response.status, 200);
  const where = JSON.stringify(h.queries[0].where);
  assert.equal(where.includes('"paidAt":{"gte":'), true);
  assert.equal(where.includes('"createdAt":{"gte":'), true);
  assert.equal(where.includes('"status":"FAILED"'), true);
  assert.equal(where.includes('"isSet":false'), true);
});

test("unassigned country and locale include legacy absent fields in revenue listing", async () => {
  const h = harness("revenue");
  const response = await h.get("status=PAID&country=__unset&locale=__unset");
  assert.equal(response.status, 200);
  const where = JSON.stringify(h.queries[0].where);
  assert.equal(where.includes('"donorCountryCode":{"isSet":false}'), true);
  assert.equal(where.includes('"locale":{"isSet":false}'), true);
});

test("accounting pagination deterministically breaks equal-date and equal-amount ties by id", async () => {
  for (const sort of ["sortBy=date&sortOrder=asc", "sortBy=amount&sortOrder=desc"] as const) {
    const h = harness("revenue");
    assert.equal((await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=PAID&"+sort)).status, 200);
    const orderBy = h.queries[1].orderBy;
    const expected = sort.startsWith("sortBy=date")
      ? '[{"paidAt":"asc"},{"id":"asc"}]'
      : '[{"amountUSD":"desc"},{"id":"desc"}]';
    assert.equal(JSON.stringify(orderBy), expected);
  }
});

test("accounting FAILED list excludes anomalous rows with paidAt, without changing legacy listing", async () => {
  const h = harness("revenue");
  assert.equal((await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=FAILED")).status, 200);
  const where = JSON.stringify(h.queries[0].where);
  assert.equal(where.includes('"status":"FAILED"'), true);
  assert.equal(where.includes('"paidAt":{"isSet":false}'), true);
});

test("invalid page, limit and sort inputs fall back to safe Prisma arguments", async () => {
  for (const input of ["page=-99&limit=-5&sortOrder=evil&sortBy=unexpected", "page=NaN&limit=NaN"]) {
    const h = harness("revenue");
    assert.equal((await h.get(input)).status, 200);
    const findMany = h.queries[1];
    assert.equal(findMany.skip, 0);
    assert.equal(findMany.take, 10);
    assert.equal(JSON.stringify(findMany.orderBy), '{"createdAt":"desc"}');
  }
});

test("page overflow cannot produce an unsafe Prisma skip", async () => {
  const h = harness("revenue");
  assert.equal((await h.get("page=9007199254740991&limit=100")).status, 200);
  assert.equal(h.queries[1].skip, 0);
  assert.equal(h.queries[1].take, 100);
});

test("accounting pagination starts at the requested safe page with deterministic tie order", async () => {
  const h = harness("revenue");
  assert.equal((await h.get("dateBasis=accounting&start=2026-11-10&end=2026-11-11&status=PAID&page=2&limit=100")).status, 200);
  assert.equal(h.queries[1].skip, 100);
  assert.equal(h.queries[1].take, 100);
  assert.equal(JSON.stringify(h.queries[1].orderBy), '[{"paidAt":"desc"},{"id":"desc"}]');
});

test("donor GET response redacts receipt bearer and raw gateway/card evidence, but retains safe display fields", async () => {
  const fixture = {
    id: "own-donation", donorId: "own-id",
    status: "PAID", paidAt: "2026-11-11T08:00:00.000Z",
    createdAt: "2026-11-10T12:00:00.000Z",
    amountUSD: 12.5, amount: 12.5, totalAmount: 12.5,
    teamSupport: 0, fees: 0, currency: "USD", provider: "ALBARAKA",
    subscriptionId: null, paymentMethod: "CARD",
    accessToken: "never-return-receipt-token",
    providerRaw: { albarakaRequest: { mode: "2D", cvc: "never-return-cvc" } },
    cardDetails: { cardNumber: "never-return-full-card-number" },
    attribution: { utm_source: "google", utm_campaign: "Gaza aid", email: "never-return-tracking-profile" },
    conversionEventsSentAt: "2026-11-11T11:00:00.000Z",
    conversionFailedEventsSentAt: null,
    bankOperations: { sale: "never-return-ledger" },
    reconciliationLeaseToken: "never-return-lease",
    paypalCaptureId: "never-return-capture",
    items: [], categoryItems: [], comments: [], referral: null,
    donor: {
      id: "own-id", name: "Fixture Donor", email: "fixture@example.test",
      image: null, password: "never-return-password-hash", verifiedAt: null,
      registeredAt: "2026-11-01T00:00:00.000Z", emailVerified: null,
      _count: { accounts: 0 },
    },
  };
  const h = harness("donor", [fixture]);
  const response = await h.get("page=1&limit=10");
  assert.equal(response.status, 200);
  const body = response.body;
  const result = (body.donations as Row[])[0];
  assert.equal(result.id, "own-donation");
  assert.equal(result.securityMode, "2D", "safe evidence still derived on server before redaction");
  assert.equal((result.donor as Row).accountStatus, "MEMBER");
  assert.equal((result.donor as Row).email, "fixture@example.test");
  for (const key of [
    "accessToken", "providerRaw", "cardDetails", "attribution",
    "bankOperations", "reconciliationLeaseToken", "paypalCaptureId",
  ]) assert.equal(Object.hasOwn(result, key), false, key);
  const revenueResponse = await harness("revenue", [fixture]).get("page=1&limit=10");
  assert.equal(revenueResponse.status, 200);
  const revenueRow = ((revenueResponse.body.donations as Row[])[0]);
  const marketing = revenueRow.attribution as Row;
  assert.equal(marketing.utm_source, "google");
  assert.equal(marketing.utm_campaign, "Gaza aid");
  assert.equal(Object.hasOwn(marketing, "email"), false);
  assert.equal(revenueRow.conversionEventsSentAt, "2026-11-11T11:00:00.000Z");
  assert.equal(Object.hasOwn(revenueRow, "providerRaw"), false);
  assert.equal(JSON.stringify(revenueResponse.body).includes("never-return-tracking-profile"), false);
  const serialized = JSON.stringify(body);
  for (const secret of [
    "never-return-receipt-token", "never-return-cvc", "never-return-full-card-number",
    "never-return-tracking-profile", "never-return-ledger", "never-return-lease",
    "never-return-capture", "never-return-password-hash",
  ]) assert.equal(serialized.includes(secret), false, secret);
});
