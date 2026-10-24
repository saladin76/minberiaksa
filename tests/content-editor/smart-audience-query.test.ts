import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadAudience(user: Record<string, unknown>) {
  const source = readFileSync("lib/communication/smart-audience.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  const dependencies: Record<string, unknown> = {
    "@prisma/client": {},
    "@/lib/prisma": { prisma: { user } },
    "@/lib/locales": { DEFAULT_LOCALE: "ar", isValidLocale: (locale: string) => ["ar", "en"].includes(locale) },
    "@/lib/badge-criteria": { getUserIdsMatchingBadge: async () => [] },
    "./audience-preview-accounting": { summarizeCampaignAudience: async (rows: AsyncIterable<unknown>) => {
      const sample = []; for await (const row of rows) sample.push(row);
      return { matched: sample.length, sample };
    } },
  };
  new vm.Script(output).runInNewContext({
    exports: module.exports, module,
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error("Unexpected dependency: " + id);
      return dependencies[id];
    },
  });
  return module.exports;
}

test("preview snapshots donors cheaply while retaining every date/project/amount filter on pages", async () => {
  const queries: any[] = [];
  const module = loadAudience({
    findFirst: async (args: unknown) => { queries.push(args); return { id: "ffffffffffffffffffffffff" }; },
    findMany: async (args: unknown) => { queries.push(args); return [{ id: "000000000000000000000001", name: null, email: null, phone: null, preferredLang: "ar", countryCode: null, communicationProfile: null }]; },
  });
  const definition = { version: 1, kind: "SMART", channel: "WHATSAPP", filters: { locales: ["ar"], donatedWithinDays: 30, notDonatedWithinDays: 7, projectIds: ["000000000000000000000002"], minDonationAmountUSD: 25, recurringOnly: true } };
  const result = await module.previewSmartAudience(definition);
  assert.equal(result.matched, 1);
  assert.equal(JSON.stringify(queries[0].where), JSON.stringify({ role: "DONOR" }));
  const membership = queries[1].where.AND[0];
  assert.equal(membership.preferredLang.in[0], "ar");
  assert.equal(membership.donations.some.AND.length, 3);
  assert.ok(membership.donations.some.AND[0].paidAt.gte);
  assert.equal(membership.donations.some.AND[1].items.some.campaignId.in[0], definition.filters.projectIds[0]);
  assert.equal(membership.donations.some.AND[2].OR[0].amountUSD.gte, 25);
  assert.ok(membership.AND[0].donations.none.paidAt.gte);
  assert.equal(membership.subscriptions.some.status, "ACTIVE");
});

test("a filtered page read failure rejects the preview instead of returning zero", async () => {
  const module = loadAudience({
    findFirst: async () => ({ id: "ffffffffffffffffffffffff" }),
    findMany: async () => { throw new Error("query timeout"); },
  });
  await assert.rejects(() => module.previewSmartAudience({ version: 1, kind: "SMART", channel: "EMAIL", filters: { donatedWithinDays: 30 } }), /query timeout/);
});
