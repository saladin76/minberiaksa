import test from "node:test";
import assert from "node:assert/strict";
import { collectSearchGrowth } from "../../lib/marketing/google-search/growth";
import type { GoogleSearchClient } from "../../lib/marketing/google-search/client";

const campaign = "customers/1234567890/campaigns/456";
const campaignRow = () => ({ campaign: { resourceName: campaign, name: "Minber plan | ar | Winter", status: "ENABLED" }, campaignBudget: { amountMicros: "10000000", recommendedBudgetAmountMicros: "15000000", explicitlyShared: false }, customer: { currencyCode: "TRY", timeZone: "Europe/Istanbul" }, metrics: { clicks: "35", costMicros: "14000000", conversions: "4.5", searchBudgetLostImpressionShare: "0.25", searchRankLostImpressionShare: "0.1" } });
const termRow = (text = "تبرع للقدس", conversions = "2") => ({ campaign: { resourceName: campaign }, searchTermView: { searchTerm: text }, metrics: { clicks: "7", costMicros: "2100000", conversions } });
function client(campaigns: unknown[] = [campaignRow()], terms: unknown[] = [termRow()], customers: unknown[] = []) {
  const queries: string[] = [];
  return { queries, client: { id: "1234567890", query: async (query: string) => { queries.push(query); return query.includes("FROM search_term_view") ? terms : query.includes("FROM customer") ? customers : campaigns; }, call: () => { throw new Error("Read-only evidence must never call mutate"); } } as unknown as GoogleSearchClient };
}

test("growth evidence preserves the account currency, provider recommendation and scoped 7-day metrics without a write", async () => {
  const h = client([campaignRow()], [termRow(), termRow("تبرع للقدس", "1.5")]);
  const result = await collectSearchGrowth(h.client, [campaign], new Date("2026-10-30T20:00:00Z"));
  assert.equal(result.currency, "TRY"); assert.equal(result.timezone, "Europe/Istanbul"); assert.equal(result.at, "2026-10-30T20:00:00.000Z");
  assert.equal(result.budgets.length, 1); assert.equal(result.budgets[0].current, 10); assert.equal(result.budgets[0].recommended, 15);
  assert.equal(result.budgets[0].googleConversions, 4.5); assert.equal(result.budgets[0].lostBudgetShare, 0.25);
  assert.equal(result.terms.length, 1); assert.equal(result.terms[0].clicks, 14); assert.equal(result.terms[0].googleConversions, 3.5); assert.equal(result.terms[0].cost, 4.2);
  assert.ok(h.queries.every(query => query.includes(`campaign.resource_name IN ('${campaign}')`) && query.includes("LAST_7_DAYS")));
});

test("growth does not infer an increase from absent, shared, paused, insufficient or invalid provider evidence", async () => {
  for (const alter of [
    (row: ReturnType<typeof campaignRow>) => { row.campaignBudget.recommendedBudgetAmountMicros = "10000000"; },
    (row: ReturnType<typeof campaignRow>) => { row.campaignBudget.explicitlyShared = true; },
    (row: ReturnType<typeof campaignRow>) => { row.campaign.status = "PAUSED"; },
    (row: ReturnType<typeof campaignRow>) => { row.metrics.clicks = "29"; },
    (row: ReturnType<typeof campaignRow>) => { row.metrics.conversions = "2.5"; },
    (row: ReturnType<typeof campaignRow>) => { row.campaignBudget.recommendedBudgetAmountMicros = "NaN"; },
  ]) {
    const row = campaignRow(); alter(row); const h = client([row]);
    assert.equal((await collectSearchGrowth(h.client, [campaign])).budgets.length, 0);
  }
  const row = campaignRow(); row.metrics.searchBudgetLostImpressionShare = ""; row.metrics.searchRankLostImpressionShare = "1.5";
  const result = await collectSearchGrowth(client([row]).client, [campaign]);
  assert.equal(result.budgets[0].lostBudgetShare, null); assert.equal(result.budgets[0].lostRankShare, null);
});

test("growth rejects cross-account scope, unexpected returned campaigns and inconsistent currency rather than mixing accounts", async () => {
  const h = client();
  await assert.rejects(collectSearchGrowth(h.client, ["customers/9999999999/campaigns/456"]), /INVALID_RESOURCE_SCOPE/);
  await assert.rejects(collectSearchGrowth(h.client, []), /INVALID_RESOURCE_SCOPE/); assert.equal(h.queries.length, 0);
  const outside = termRow(); outside.campaign.resourceName = "customers/1234567890/campaigns/999";
  await assert.rejects(collectSearchGrowth(client([campaignRow()], [outside]).client, [campaign]), /INVALID_RESOURCE_SCOPE/);
  const other = campaignRow(); other.campaign.resourceName = "customers/1234567890/campaigns/789"; other.customer.currencyCode = "USD";
  await assert.rejects(collectSearchGrowth(client([campaignRow(), other]).client, [campaign, other.campaign.resourceName]), /GOOGLE_GROWTH_RESPONSE_INVALID/);
});

test("bounded search-term evidence flags truncation and excludes invalid content instead of reporting a complete total", async () => {
  const h = client([campaignRow()], Array.from({ length: 1001 }, (_, i) => termRow(i === 0 ? "<invalid>" : `winter ${i}`)));
  const result = await collectSearchGrowth(h.client, [campaign]);
  assert.equal(result.bounded, true); assert.equal(result.terms.length, 20); assert.ok(result.terms.every(row => !row.text.includes("<")));
  const failed = client(); failed.client.query = async () => { throw new Error("Provider timeout"); };
  await assert.rejects(collectSearchGrowth(failed.client, [campaign]), /Provider timeout/);
});

test("a new campaign without impressions returns an empty review using account metadata rather than a false failure", async () => {
  const h = client([], [], [campaignRow()]);
  const result = await collectSearchGrowth(h.client, [campaign]);
  assert.equal(result.status, "READY"); assert.equal(result.currency, "TRY"); assert.deepEqual(result.budgets, []); assert.deepEqual(result.terms, []);
  assert.ok(h.queries.some(query => query.includes("FROM customer")));
});
