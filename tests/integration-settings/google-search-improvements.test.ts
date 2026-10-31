import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { searchAdCopy } from "../../lib/marketing/google-search/contracts";
import * as searchContracts from "../../lib/marketing/google-search/contracts";
import { SearchApiError } from "../../lib/marketing/google-search/client";
// Provider rows are dynamic only inside this isolated fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const planId = "507f1f77bcf86cd799439011", campaign = "customers/1234567890/campaigns/123", adGroup = "customers/1234567890/adGroups/12";
const original = { headlines: ["Support winter", "Give warmth", "Donate today"], descriptions: ["Support the published winter project.", "Give through the foundation website."] };
const creative = { headlines: ["Bring winter warmth", "Help families", "Support this winter"], descriptions: ["Help the published winter project.", "Support families through the website."] };
const proposal = { campaigns: [{ locale: "en", adGroups: [{ name: "Warmth", projectId: planId, ...original, keywords: [{ text: "winter donation", matchType: "EXACT" }], negativeKeywords: ["jobs"] }] }] };
const destination = { projectId: planId, locale: "en", title: "Winter support", description: "Published winter project", url: "https://minberiaksa.org/en/bagislar/winter" };
function fixture(options: { outside?: boolean; aiFail?: boolean; duplicate?: boolean } = {}) {
  const rows = { campaign: { resourceName: campaign, name: `Minber ${planId} | en | Winter` }, adGroup: { resourceName: adGroup, name: "Warmth", status: "ENABLED" } };
  const keywords: Row[] = [{ ...rows, adGroupCriterion: { resourceName: "customers/1234567890/adGroupCriteria/12~1", status: "ENABLED", keyword: { text: "winter donation", matchType: "EXACT" } } }, { ...rows, adGroupCriterion: { negative: true, keyword: { text: "jobs", matchType: "PHRASE" } } }];
  const ads: Row[] = [{ ...rows, adGroupAd: { resourceName: "customers/1234567890/adGroupAds/12~1", status: "ENABLED", ad: { finalUrls: [destination.url], responsiveSearchAd: { headlines: original.headlines.map(text => ({ text })), descriptions: original.descriptions.map(text => ({ text })) } } } }];
  const terms: Row[] = ["winter donation", "winter donation help", "winter donation families", "winter donation relief", "winter donation more", "winter donation jobs", "unrelated crypto", "winter donation 123456", "winter donation email@example.com"].map(text => ({ ...rows, searchTermView: { searchTerm: text }, metrics: { clicks: 10, conversions: 3, costMicros: 6000000 } }));
  if (options.outside) terms[0] = { ...terms[0], campaign: { resourceName: "customers/1234567890/campaigns/999" } };
  let generationCalls = 0;
  const client = { id: "1234567890", query: async (query: string) => query.includes("FROM search_term_view") ? terms : query.includes("FROM ad_group_ad") ? ads : query.includes("FROM ad_group_criterion") ? keywords : [rows] };
  const deps: Row = { zod: { z }, "./creative": { suggestSearchCreative: async () => { generationCalls++; if (options.aiFail) throw new Error("AI_DOWN"); return options.duplicate ? { headlines: [...original.headlines].reverse(), descriptions: original.descriptions } : creative; } } };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("lib/marketing/google-search/improvements.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, URL, Date, JSON, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { collect: (expandKeywords = true, refreshAds = true) => loaded.exports.collectSearchImprovements(client, [campaign], planId, proposal, [destination], { enabled: true, maxKeywordCost: 5, minClicks: 20, expandKeywords, refreshAds }, new Date()), verify: (value: unknown) => loaded.exports.verifySearchImprovements(client, [campaign], value), operations: loaded.exports.searchImprovementOperations, keywords, ads, rows, client, module: loaded.exports, count: () => generationCalls };
}
test("opt-in expansion adds at most three relevant, nonduplicate exact keywords and one new scoped creative", async () => {
  const h = fixture(), result = await h.collect();
  assert.equal(result.keywords.length, 3); assert.equal(result.ads.length, 1); assert.equal(h.count(), 1);
  assert.ok(result.keywords.every((k: Row) => k.adGroup === adGroup && k.matchType === "EXACT" && !/jobs|crypto|123456|@/.test(k.text)));
  const url = new URL(result.ads[0].url); assert.equal(url.hostname, "minberiaksa.org"); assert.equal(url.pathname, "/en/bagislar/winter"); assert.equal(url.searchParams.get("utm_campaign"), `gs-${planId}`);
  const operations = h.operations(result); assert.equal(operations.length, 4); assert.ok(operations.every((op: Row) => !op.campaignBudgetOperation && !op.campaignOperation));
});
test("feature flags prevent new keywords/creative; a failed model does not discard keyword review; reordered duplicate ads are skipped", async () => {
  const off = fixture(), disabled = await off.collect(false, false); assert.equal(disabled.keywords.length, 0); assert.equal(disabled.ads.length, 0); assert.equal(off.count(), 0);
  const failed = await fixture({ aiFail: true }).collect(); assert.equal(failed.keywords.length, 3); assert.equal(failed.ads.length, 0); assert.equal(failed.warnings[0], "CREATIVE_UNAVAILABLE_REVIEW_REQUIRED");
  assert.equal((await fixture({ duplicate: true }).collect()).ads.length, 0);
  await assert.rejects(fixture({ outside: true }).collect(), /INVALID_RESOURCE_SCOPE/);
});
test("provider readback verifies every new object and refuses partial, duplicate or missing outcomes without replay", async () => {
  const h = fixture(), pending = await h.collect();
  await assert.rejects(h.verify(pending), /OPTIMIZATION_REQUIRES_RECONCILIATION/);
  for (const k of pending.keywords) h.keywords.push({ ...h.rows, adGroupCriterion: { status: "ENABLED", negative: false, keyword: { text: k.text, matchType: "EXACT" } } });
  const a = pending.ads[0]; h.ads.push({ ...h.rows, adGroupAd: { status: "ENABLED", ad: { finalUrls: [a.url], responsiveSearchAd: { headlines: [...a.headlines].reverse().map(text => ({ text })), descriptions: a.descriptions.map((text: string) => ({ text })) } } } });
  assert.equal((await h.verify(pending)).keywords.length, 3);
  h.keywords.push(h.keywords.at(-1)!); await assert.rejects(h.verify(pending), /OPTIMIZATION_REQUIRES_RECONCILIATION/);
});
test("creative validates copy length, source numbers and language before any advertising mutation", async () => {
  let answer = JSON.stringify(creative);
  const deps: Row = { "./contracts": { searchAdCopy }, "@/lib/ai/core/ai-core-service": { getAiContext: () => ({}) }, "@/lib/ai/core/openai-provider": { generateOpenAiDraft: async () => ({ status: "COMPLETED", mode: "OPENAI", answer }) } };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("lib/marketing/google-search/creative.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, JSON, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  assert.equal((await loaded.exports.suggestSearchCreative(destination, original, [])).headlines.length, 3);
  answer = JSON.stringify({ ...creative, headlines: ["Help 500 families", ...creative.headlines.slice(1)] }); await assert.rejects(loaded.exports.suggestSearchCreative(destination, original, []), /AD_COPY_FACTS_REQUIRE_REVIEW/);
  answer = JSON.stringify({ ...creative, headlines: ["Donate المبارك", ...creative.headlines.slice(1)] }); await assert.rejects(loaded.exports.suggestSearchCreative(destination, original, []), /AD_COPY_LANGUAGE_REQUIRES_REVIEW/);
  answer = JSON.stringify({ ...creative, headlines: ["A".repeat(31), ...creative.headlines.slice(1)] }); await assert.rejects(loaded.exports.suggestSearchCreative(destination, original, []));
});

test("automatic mutations are reserved before sending; unknown outcomes freeze, cannot replay, and reconcile only from every created object", async () => {
  const h = fixture();
  const fullProposal = { summary: "Winter", campaigns: [{ locale: "en", name: "Winter", dailyBudgetMicros: 10000000, adGroups: [{ ...proposal.campaigns[0].adGroups[0], rationale: "Published project" }] }], expansion: [] };
  let plan: Row = { id: planId, version: 1, status: "ACTIVE", connectionId: planId, request: { connectionId: planId, prompt: "Winter campaign", locales: ["en"], countries: ["TR"], projectIds: [planId], dailyBudget: 10, containsEuPoliticalAdvertising: false }, proposal: fullProposal, evidence: {}, resources: { campaigns: [campaign] }, automationEnabled: true, automationPolicy: { enabled: true, maxKeywordCost: 5, minClicks: 20, expandKeywords: true, refreshAds: true }, lastReviewAt: null, workLeaseUntil: null, workLeaseToken: null, updatedAt: new Date(0) };
  const originalQuery = h.client.query;
  const campaignRow = { campaign: { ...h.rows.campaign, status: "ENABLED", campaignBudget: "customers/1234567890/campaignBudgets/124" }, campaignBudget: { amountMicros: "10000000", explicitlyShared: false } };
  const writes: Row[] = [];
  const client = { id: "1234567890", query: async (q: string) => q.includes("FROM customer") ? [{ customer: { currencyCode: "USD", timeZone: "Europe/Istanbul" } }] : q.includes("FROM campaign") ? [campaignRow] : q.includes("FROM keyword_view") ? [] : originalQuery(q), call: async (_: string, body: Row) => {
    writes.push(body);
    if (body.validateOnly) return {};
    assert.equal(plan.status, "CHANGING"); assert.ok(plan.evidence.optimizationPending);
    for (const k of plan.evidence.optimizationPending.keywords) h.keywords.push({ ...h.rows, adGroupCriterion: { status: "ENABLED", keyword: { text: k.text, matchType: "EXACT" } } });
    for (const a of plan.evidence.optimizationPending.ads) h.ads.push({ ...h.rows, adGroupAd: { status: "ENABLED", ad: { finalUrls: [a.url], responsiveSearchAd: { headlines: a.headlines.map((text: string) => ({ text })), descriptions: a.descriptions.map((text: string) => ({ text })) } } } });
    throw new SearchApiError("GOOGLE_ADS_OUTCOME_UNKNOWN", 502, true);
  } };
  const db = { marketingPlatformConnection: { findFirst: async () => ({ id: planId }) }, googleSearchPlan: {
    findUnique: async () => structuredClone(plan), findUniqueOrThrow: async () => structuredClone(plan),
    findFirst: async ({ where }: Row) => where.version === plan.version && where.workLeaseToken === plan.workLeaseToken && plan.automationEnabled && plan.status === where.status ? structuredClone(plan) : null,
    updateMany: async ({ where, data }: Row) => {
      if (where.version !== undefined && where.version !== plan.version || where.status && where.status !== plan.status || where.workLeaseToken && where.workLeaseToken !== plan.workLeaseToken || where.automationEnabled !== undefined && where.automationEnabled !== plan.automationEnabled || where.OR && plan.workLeaseUntil && plan.workLeaseUntil > new Date()) return { count: 0 };
      plan = { ...plan, ...data, version: data.version ? plan.version + 1 : plan.version }; return { count: 1 };
    },
  } };
  const deps: Row = { "node:crypto": { randomUUID: () => "worker-lease" }, "@/lib/prisma": { prisma: db }, "@/lib/audit-log": { queueAuditLog() {} }, "./contracts": searchContracts, "./client": { SearchApiError, googleSearchClient: async () => client, searchCredentials: () => ({}) }, "./executor": { jsonValue: (v: unknown) => v }, "./improvements": h.module, "./growth": { collectSearchGrowth: async () => ({ status: "READY" }) }, "./planner": { searchDestinations: async () => [destination] } };
  function load(path: string) {
    const loaded = { exports: {} as Row };
    new vm.Script(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, Date, JSON, URL, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } }); return loaded.exports;
  }
  const optimizer = load("lib/marketing/google-search/optimizer.ts");
  await optimizer.optimizeSearchPlan(planId, new Date());
  assert.equal(plan.status, "RECONCILE_REQUIRED"); assert.equal(plan.automationEnabled, false); assert.equal(writes.length, 2);
  assert.equal(plan.evidence.optimizationPending.keywords.length, 3);
  await optimizer.optimizeSearchPlan(planId, new Date()); assert.equal(writes.length, 2);
  const executor = load("lib/marketing/google-search/executor.ts");
  const removed = h.keywords.pop()!;
  await assert.rejects(executor.executeSearchPlan({ id: planId, version: plan.version, action: "reconcile" }), /OPTIMIZATION_REQUIRES_RECONCILIATION/);
  assert.equal(plan.status, "RECONCILE_REQUIRED"); h.keywords.push(removed);
  await executor.executeSearchPlan({ id: planId, version: plan.version, action: "reconcile" });
  assert.equal(plan.status, "ACTIVE"); assert.equal(plan.automationEnabled, false); assert.equal(plan.evidence.optimizationPending, null); assert.equal(writes.length, 2);
});
