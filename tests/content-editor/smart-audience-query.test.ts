import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadAudience(user: Record<string, unknown>) {
  const source = readFileSync("lib/communication/smart-audience.ts", "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const isolatedModule = { exports: {} as { previewSmartAudience: (definition: unknown) => Promise<{ matched: number }> } };
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
    exports: isolatedModule.exports, module: isolatedModule,
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error("Unexpected dependency: " + id);
      return dependencies[id];
    },
  });
  return isolatedModule.exports;
}

test("preview snapshots donors cheaply while retaining every date/project/amount filter on pages", async () => {
  const queries: Array<{ where: Record<string, unknown> }> = [];
  const isolatedModule = loadAudience({
    findFirst: async (args: unknown) => { queries.push(args as { where: Record<string, unknown> }); return { id: "ffffffffffffffffffffffff" }; },
    findMany: async (args: unknown) => { queries.push(args as { where: Record<string, unknown> }); return [{ id: "000000000000000000000001", name: null, email: null, phone: null, preferredLang: "ar", countryCode: null, communicationProfile: null }]; },
  });
  const definition = { version: 1, kind: "SMART", channel: "WHATSAPP", filters: { locales: ["ar"], donatedWithinDays: 30, notDonatedWithinDays: 7, projectIds: ["000000000000000000000002"], minDonationAmountUSD: 25, recurringOnly: true } };
  const result = await isolatedModule.previewSmartAudience(definition);
  assert.equal(result.matched, 1);
  assert.equal(JSON.stringify(queries[0].where), JSON.stringify({ role: "DONOR" }));
  const membership = JSON.stringify(queries[1].where);
  assert.match(membership, /"preferredLang":\{"in":\["ar"\]\}/);
  assert.match(membership, /"paidAt":\{"gte":/);
  assert.match(membership, /"campaignId":\{"in":\["000000000000000000000002"\]\}/);
  assert.match(membership, /"amountUSD":\{"gte":25\}/);
  assert.match(membership, /"donations":\{"none":/);
  assert.match(membership, /"subscriptions":\{"some":\{"status":"ACTIVE"\}\}/);
});

test("a filtered page read failure rejects the preview instead of returning zero", async () => {
  const isolatedModule = loadAudience({
    findFirst: async () => ({ id: "ffffffffffffffffffffffff" }),
    findMany: async () => { throw new Error("query timeout"); },
  });
  await assert.rejects(() => isolatedModule.previewSmartAudience({ version: 1, kind: "SMART", channel: "EMAIL", filters: { donatedWithinDays: 30 } }), /query timeout/);
});
