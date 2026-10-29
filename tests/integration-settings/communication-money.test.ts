import * as projects from "../../lib/templates/donation-projects";
import * as donationMoney from "../../lib/templates/donation-money";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { donationUsdAmount, formatTemplateMoney } from "../../lib/templates/money";

test("USD reporting uses the settled snapshot without treating local amounts as dollars", () => {
  assert.equal(donationUsdAmount({ amount: 1500.25, currency: "TRY", amountUSD: 42.75 }), 42.75);
  assert.equal(donationUsdAmount({ amount: 1500.25, currency: "TRY", amountUSD: null }), null);
  assert.equal(donationUsdAmount({ amount: 12.34, currency: "USD", amountUSD: null }), 12.34);
  assert.equal(donationUsdAmount({ amount: 12, currency: "EUR", amountUSD: 0 }), 0);
});

test("template money keeps cents and currency precision rather than rounding to whole units", () => {
  assert.equal(formatTemplateMoney(12.34, "en", "USD"), "12.34");
  assert.equal(formatTemplateMoney(1000.25, "en", "TRY"), "1,000.25");
  assert.equal(formatTemplateMoney(1.234, "en", "KWD"), "1.234");
  assert.equal(formatTemplateMoney(null, "en", "USD"), "");
  assert.equal(formatTemplateMoney(Number.NaN, "en", "USD"), "");
});

test("actual context loader supports category-only donations and this site's Prisma relations", async () => {
  const donor = { id: "user", name: "Donor", email: "donor@example.test", phone: null, countryName: "Türkiye", country: "TR", countryCode: "TR", city: "", region: "", preferredLang: "en" };
  const donation = { id: "donation", donorId: "user", locale: "en", amount: 1234.56, amountUSD: 35.27, totalAmount: 1250.56, currency: "TRY", status: "PAID", createdAt: new Date("2026-10-19"), items: [], categoryItems: [{ amount: 1234.56, amountUSD: 35.27, category: { name: "الإغاثة الطبية", translations: [{ locale: "en", name: "Medical relief" }] } }] };
  const prisma = {
    user: { findUnique: async () => donor, findMany: async () => [donor] },
    donation: {
      findMany: async (args: { select: Record<string, unknown> }) => { assert.ok("waqfItems" in args.select); return [donation]; },
      findUnique: async () => donation,
    },
  };
  const dependencies: Record<string, unknown> = { "@/lib/prisma": { prisma }, "./donation-projects": projects, "./donation-money": donationMoney, "./money": { donationUsdAmount, formatTemplateMoney }, "./variable-catalog": {} };
  const output = ts.transpileModule(fs.readFileSync("lib/templates/variables.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new vm.Script(output).runInNewContext({ module: loaded, exports: loaded.exports, Date, Intl, Map, require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  const api = loaded.exports as { loadContext: (id: string) => Promise<{ donation?: unknown; donations: Array<{ campaignTitle: string; amount: string; currency: string; amountUSD: string }>; totals: { amountUSD: string } }>; loadContextsForUserIds: (ids: string[]) => Promise<Map<string, unknown>> };
  const context = await api.loadContext("user");
  assert.equal(context.donations[0].campaignTitle, "Medical relief");
  assert.equal(context.donations[0].amount, "1,234.56");
  assert.equal(context.donations[0].amountUSD, "35.27");
  assert.equal(context.donations[0].currency, "TRY");
  assert.equal(context.totals.amountUSD, "35.27");
  assert.ok((await api.loadContextsForUserIds(["user"])).has("user"));
});
