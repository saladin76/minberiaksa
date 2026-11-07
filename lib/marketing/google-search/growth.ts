import type { GoogleSearchClient } from "./client";

export type SearchGrowth = {
  status: "READY";
  at: string;
  period: "LAST_7_DAYS";
  currency: string;
  timezone: string;
  bounded: boolean;
  budgets: { campaign: string; name: string; current: number; recommended: number; clicks: number; googleConversions: number; cost: number; lostBudgetShare: number | null; lostRankShare: number | null }[];
  terms: { campaign: string; text: string; clicks: number; cost: number; googleConversions: number }[];
};
export type SearchGrowthResult = SearchGrowth | { status: "UNAVAILABLE"; at: string; reason: string };

const finite = (value: unknown): number | null => {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const share = (value: unknown) => { const n = finite(value); return n !== null && n <= 1 ? n : null; };

/** Read-only provider evidence. Suggestions never authorize a budget or keyword mutation. */
export async function collectSearchGrowth(client: GoogleSearchClient, names: string[], now = new Date()): Promise<SearchGrowth> {
  if (!names.length || names.length > 19 || new Set(names).size !== names.length || names.some(name => !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(name))) throw new Error("INVALID_RESOURCE_SCOPE");
  const scope = `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})`;
  const [campaigns, terms] = await Promise.all([
    client.query(`SELECT campaign.resource_name, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.recommended_budget_amount_micros, customer.currency_code, customer.time_zone, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE ${scope} AND segments.date DURING LAST_7_DAYS`),
    client.query(`SELECT campaign.resource_name, search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${scope} AND segments.date DURING LAST_7_DAYS AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 1001`, 2000),
  ]);
  if (campaigns.some(row => !names.includes(row.campaign.resourceName)) || terms.some(row => !names.includes(row.campaign.resourceName))) throw new Error("INVALID_RESOURCE_SCOPE");
  if (new Set(campaigns.map(row => row.campaign.resourceName)).size !== campaigns.length) throw new Error("GOOGLE_GROWTH_RESPONSE_INVALID");
  // A new campaign can legitimately have no metric rows yet. Read its account
  // metadata instead of confusing the absence of impressions with an API error.
  const customer = campaigns[0]?.customer ?? (await client.query("SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1"))[0]?.customer;
  const currency = customer?.currencyCode, timezone = customer?.timeZone;
  if (!currency || !/^[A-Z]{3}$/.test(currency) || !timezone || campaigns.some(row => row.customer.currencyCode !== currency || row.customer.timeZone !== timezone)) throw new Error("GOOGLE_GROWTH_RESPONSE_INVALID");
  // Metrics are Google's advertising conversions, not proof of paid site donations.
  const budgets: SearchGrowth["budgets"] = [];
  for (const row of campaigns) {
    const current = finite(row.campaignBudget.amountMicros), recommended = finite(row.campaignBudget.recommendedBudgetAmountMicros);
    const clicks = finite(row.metrics.clicks), cost = finite(row.metrics.costMicros), conversions = finite(row.metrics.conversions);
    if (row.campaign.status !== "ENABLED" || row.campaignBudget.explicitlyShared || current === null || current <= 0 || recommended === null || recommended <= current || clicks === null || clicks < 30 || conversions === null || conversions < 3 || cost === null) continue;
    budgets.push({ campaign: row.campaign.resourceName, name: row.campaign.name, current: current / 1e6, recommended: recommended / 1e6, clicks, googleConversions: conversions, cost: cost / 1e6, lostBudgetShare: share(row.metrics.searchBudgetLostImpressionShare), lostRankShare: share(row.metrics.searchRankLostImpressionShare) });
  }
  // A term can appear in multiple ad groups. Aggregate before ranking, without
  // pretending the first 1,000 rows are a complete account or conversion ledger.
  const grouped = new Map<string, SearchGrowth["terms"][number]>();
  for (const row of terms.slice(0, 1000)) {
    const text = row.searchTermView?.searchTerm?.trim(), clicks = finite(row.metrics.clicks), cost = finite(row.metrics.costMicros), conversions = finite(row.metrics.conversions);
    if (!text || [...text].length > 80 || /[\r\n<>]/.test(text) || clicks === null || cost === null || conversions === null || conversions <= 0) continue;
    const key = `${row.campaign.resourceName}\0${text.toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) { existing.clicks += clicks; existing.cost += cost / 1e6; existing.googleConversions += conversions; }
    else grouped.set(key, { campaign: row.campaign.resourceName, text, clicks, cost: cost / 1e6, googleConversions: conversions });
  }
  return { status: "READY", at: now.toISOString(), period: "LAST_7_DAYS", currency, timezone, bounded: terms.length > 1000, budgets, terms: [...grouped.values()].sort((a, b) => b.googleConversions - a.googleConversions || a.cost - b.cost).slice(0, 20) };
}
