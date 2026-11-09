import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Row = Record<string, unknown>;

test("donor summary counts only the signed-in donor's active plans and settled gifts", async () => {
  const queries: Row[] = [];
  const subscriptions = [
    { status: "ACTIVE" },
    { status: "CANCELLED" },
    { status: "PAYMENT_FAILED" },
  ];
  const prisma = {
    user: {
      findUnique: async ({ where }: Row) => {
        queries.push(where as Row);
        assert.equal((where as Row).id, "fixture-donor");
        return {
          id: "fixture-donor",
          name: "Synthetic Donor",
          email: "donor@example.invalid",
          phone: null,
          birthdate: null,
          city: null,
          region: null,
          countryName: null,
          country: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        };
      },
    },
    donation: {
      findMany: async ({ where }: Row) => {
        const filter = where as Row;
        queries.push(filter);
        assert.equal(filter.donorId, "fixture-donor");
        assert.equal(filter.status, "PAID");
        assert.deepEqual(filter.paidAt, { not: null });
        return [
          {
            id: "fixture-gift",
            totalAmount: 20,
            currency: "USD",
            createdAt: new Date("2026-01-02T00:00:00Z"),
            paidAt: new Date("2026-01-02T00:01:00Z"),
            subscriptionId: null,
            items: [],
          },
        ];
      },
      aggregate: async ({ where }: Row) => {
        const filter = where as Row;
        assert.equal(filter.donorId, "fixture-donor");
        assert.equal(filter.status, "PAID");
        assert.deepEqual(filter.paidAt, { not: null });
        return { _sum: { amountUSD: 20 }, _count: { _all: 1 } };
      },
    },
    subscription: {
      count: async ({ where }: Row) => {
        const filter = where as Row;
        queries.push(filter);
        assert.equal(filter.donorId, "fixture-donor");
        assert.equal(filter.status, "ACTIVE");
        return subscriptions.filter((row) => row.status === filter.status).length;
      },
    },
    bankTransferClaim: { findMany: async () => [] },
  };
  const fixture = { exports: {} as Row };
  const source = readFileSync("lib/minbar/account.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: fixture,
    exports: fixture.exports,
    console: { error: () => {} },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/i18n/translation-fallback") {
        return { pickTranslation: () => null, translationLocaleWhere: () => ({}) };
      }
      if (name === "@/lib/donations/bank-transfer-shared") return { claimAcceptsReceipt: () => false };
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const result = await (fixture.exports.getAccountSummary as (id: string, locale: string) => Promise<Row>)(
    "fixture-donor",
    "en",
  );
  assert.ok(result);
  assert.equal(result.activeSubscriptions, 1);
  assert.equal(result.donationCount, 1);
  assert.equal(result.totalDonatedUSD, 20);
  assert.equal((result.donations as unknown[]).length, 1);
  assert.equal(queries.length, 3);
});
