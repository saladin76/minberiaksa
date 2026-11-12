import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { donationListSafeFields } from "../../lib/dashboard/donation-list-privacy";

type Row = Record<string, unknown>;
function harness(role: "donor" | "revenue") {
  const queries: Row[] = [];
  const fixture = {
    id: "donation-for-donor", donorId: "donor",
    status: "PAID", amountUSD: 12, amount: 12, currency: "USD",
    provider: "ALBARAKA", createdAt: "2026-11-11T08:00:00.000Z",
    accessToken: "never-return-guest-bearer",
    cardDetails: { cardNumber: "never-return-pan", cvv: "never-return-cvv" },
    providerRaw: { bankRequest: "never-return-raw-psp" },
    bankOperations: { auth: "never-return-bank-locks" },
    reconciliationLeaseToken: "never-return-lease",
    attribution: { utm_campaign: "Relief", client_ip: "192.0.2.1", secret: "never-return-tracking-extra" },
    conversionEventsSentAt: "2026-11-11T10:00:00.000Z",
    donor: { name: "Fixture", email: "fixture@example.test", image: null },
    items: [], comments: [],
  };
  const loaded = { exports: {} as Record<string, (request: { url: string }) => Promise<{ body: Row; status: number }>> };
  const source = readFileSync("app/api/cart/payment/route.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module: loaded, exports: loaded.exports, URL, console: { error() {} },
    require: (name: string) => ({
      "next/server": { NextResponse: { json: (body: Row, init: { status?: number } = {}) =>
        ({ body, status: init.status ?? 200 }) } },
      "next-auth": { getServerSession: async () => ({ user: { id: "donor", role } }) },
      "@/lib/dashboard/permissions": { userHasDashboardPermission: (_user: Row, permission: string) =>
        role === "revenue" && permission === "revenue" },
      "@/lib/dashboard/donation-list-privacy": { donationListSafeFields },
      "@/lib/prisma": { prisma: { donation: {
        count: async (args: Row) => { queries.push(args); return 1; },
        findMany: async (args: Row) => { queries.push(args); return [fixture]; },
      } } },
    } as Record<string, unknown>)[name] ?? {},
  });
  return {
    get: (query: string) => loaded.exports.GET({ url: "https://example.invalid/api/cart/payment?" + query }),
    queries,
  };
}

test("cart donation GET donor JSON omits receipt bearer, CVV, PAN, raw PSP and tracking", async () => {
  const h = harness("donor");
  const response = await h.get("userId=another-donor");
  assert.equal(response.status, 200);
  const where = h.queries[0].where as Row;
  assert.equal(where.donorId, "donor", "donor's identity takes precedence over supplied userId");
  const rows = response.body.donations as Row[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "donation-for-donor");
  const json = JSON.stringify(response.body);
  for (const value of [
    "never-return-guest-bearer", "never-return-pan", "never-return-cvv",
    "never-return-raw-psp", "never-return-bank-locks", "never-return-lease",
    "never-return-tracking-extra", "192.0.2.1",
  ]) assert.equal(json.includes(value), false, value);
  const omit = h.queries[1].omit as Row;
  for (const key of ["accessToken", "cardDetails", "providerRaw", "bankOperations", "reconciliationLeaseToken"]) {
    assert.equal(omit[key], true, key);
  }
});

test("cart donation GET for revenue shows allowlisted campaign attribution, never raw snapshot", async () => {
  const h = harness("revenue");
  const response = await h.get("page=-10&limit=-3");
  assert.equal(response.status, 200);
  assert.equal(h.queries[1].skip, 0);
  assert.equal(h.queries[1].take, 10);
  const row = (response.body.donations as Row[])[0];
  assert.equal((row.attribution as Row).utm_campaign, "Relief");
  assert.equal((row.attribution as Row).secret, undefined);
  assert.equal(row.conversionEventsSentAt, "2026-11-11T10:00:00.000Z");
  assert.equal(Object.hasOwn(row, "providerRaw"), false);
});
