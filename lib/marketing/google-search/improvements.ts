import { z } from "zod";
import type { GoogleSearchClient } from "./client";
import type { SearchAutomationPolicy, SearchDestination, SearchProposal } from "./contracts";
import { suggestSearchCreative } from "./creative";

const resource = (kind: string) => z.string().regex(new RegExp(`^customers/\\d{10}/${kind}/\\d+(?:~\\d+)?$`));
export const searchImprovementSchema = z.object({
  at: z.string(),
  paused: z.array(resource("adGroupCriteria")).max(5),
  keywords: z.array(z.object({ adGroup: resource("adGroups"), text: z.string().min(2).max(80), matchType: z.literal("EXACT") }).strict()).max(3),
  ads: z.array(z.object({ adGroup: resource("adGroups"), url: z.string().url(), headlines: z.array(z.string()).min(3).max(15), descriptions: z.array(z.string()).min(2).max(4) }).strict()).max(1),
  warnings: z.array(z.string()).max(1).default([]),
}).strict();
export type SearchImprovement = z.infer<typeof searchImprovementSchema>;
const normalized = (text: string) => text.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const copyKey = (values: { text: string }[]) => values.map(v => v.text).sort().join("\0");
function scope(client: GoogleSearchClient, names: string[]) {
  if (!names.length || names.some(name => !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(name))) throw new Error("INVALID_RESOURCE_SCOPE");
  return `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})`;
}
function validAdGroup(client: GoogleSearchClient, name: string) { return new RegExp(`^customers/${client.id}/adGroups/\\d+$`).test(name); }
function destinationUrl(url: string, planId: string, locale: string) {
  const value = new URL(url);
  if (value.protocol !== "https:" || value.hostname !== "minberiaksa.org" || !value.pathname.startsWith(`/${locale}/`) || value.username || value.password) throw new Error("INVALID_SITE_DESTINATION");
  value.searchParams.set("utm_source", "google"); value.searchParams.set("utm_medium", "cpc");
  value.searchParams.set("utm_campaign", `gs-${planId}`); value.searchParams.set("utm_content", locale);
  return value.toString();
}

/** Uses observed converting terms and page-grounded copy without new spending authority. */
export async function collectSearchImprovements(client: GoogleSearchClient, names: string[], planId: string, proposal: SearchProposal, destinations: SearchDestination[], policy: SearchAutomationPolicy, now: Date): Promise<SearchImprovement> {
  const condition = scope(client, names);
  const [groups, existing, ads, terms] = await Promise.all([
    client.query(`SELECT campaign.resource_name, campaign.name, ad_group.resource_name, ad_group.name, ad_group.status FROM ad_group WHERE ${condition} AND ad_group.status = 'ENABLED'`),
    client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative FROM ad_group_criterion WHERE ${condition} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`),
    policy.refreshAds ? client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ${condition} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status != 'REMOVED'`) : Promise.resolve([]),
    client.query(`SELECT campaign.resource_name, ad_group.resource_name, search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${condition} AND segments.date DURING LAST_7_DAYS AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 1000`),
  ]);
  for (const row of [...groups, ...existing, ...ads, ...terms]) if (!names.includes(row.campaign.resourceName) || !validAdGroup(client, row.adGroup.resourceName)) throw new Error("INVALID_RESOURCE_SCOPE");
  const result: SearchImprovement = { at: now.toISOString(), paused: [], keywords: [], ads: [], warnings: [] };
  let creativeAttempted = false;
  const known = new Set(existing.map(row => `${row.adGroup.resourceName}\0${normalized(row.adGroupCriterion.keyword.text)}`));
  for (const row of groups) {
    const locale = String(row.campaign.name).split(" | ")[1];
    if (!String(row.campaign.name).startsWith(`Minber ${planId} | `)) throw new Error("INVALID_RESOURCE_SCOPE");
    const matches = proposal.campaigns.find(c => c.locale === locale)?.adGroups.filter(g => g.name === row.adGroup.name) || [];
    if (matches.length !== 1) continue;
    const group = matches[0], destination = destinations.find(d => d.projectId === group.projectId && d.locale === locale);
    if (!destination) continue;
    const converting = terms.filter(t => t.adGroup.resourceName === row.adGroup.resourceName && Number(t.metrics.conversions) >= 1 && Number(t.metrics.clicks) >= 3 && Number(t.metrics.costMicros) / 1e6 / Number(t.metrics.conversions) <= policy.maxKeywordCost);
    if (policy.expandKeywords) for (const term of converting) {
      const text = term.searchTermView?.searchTerm?.trim() || "", key = `${row.adGroup.resourceName}\0${normalized(text)}`;
      // Avoid personal identifiers and unrelated terms even if a broad query converted.
      const related = group.keywords.some(k => normalized(text).includes(normalized(k.text)) || normalized(k.text).includes(normalized(text)));
      const excluded = group.negativeKeywords.some(k => normalized(text).includes(normalized(k))) || existing.some(k => k.adGroup.resourceName === row.adGroup.resourceName && k.adGroupCriterion.negative && normalized(text).includes(normalized(k.adGroupCriterion.keyword.text)));
      if (!related || excluded || text.length < 2 || [...text].length > 80 || /[\r\n<>@]|\d{6}/.test(text) || known.has(key) || result.keywords.length >= 3) continue;
      result.keywords.push({ adGroup: row.adGroup.resourceName, text, matchType: "EXACT" }); known.add(key);
    }
    if (!policy.refreshAds || creativeAttempted || converting.reduce((sum, t) => sum + Number(t.metrics.conversions), 0) < 3) continue;
    const current = ads.filter(a => a.adGroup.resourceName === row.adGroup.resourceName);
    if (!current.some(a => a.adGroupAd.status === "ENABLED") || current.length >= 3) continue;
    const url = destinationUrl(destination.url, planId, locale);
    creativeAttempted = true;
    let variant;
    try { variant = await suggestSearchCreative(destination, group, current.map(a => a.adGroupAd.ad.responsiveSearchAd)); }
    catch { result.warnings.push("CREATIVE_UNAVAILABLE_REVIEW_REQUIRED"); continue; }
    const sameAssets = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const duplicate = current.some(a => sameAssets(a.adGroupAd.ad.responsiveSearchAd.headlines.map(v => v.text), variant.headlines) && sameAssets(a.adGroupAd.ad.responsiveSearchAd.descriptions.map(v => v.text), variant.descriptions));
    if (!duplicate) result.ads.push({ adGroup: row.adGroup.resourceName, url, ...variant });
  }
  return result;
}

export function searchImprovementOperations(value: SearchImprovement) {
  const result = searchImprovementSchema.parse(value);
  return [
    ...result.paused.map(resourceName => ({ adGroupCriterionOperation: { update: { resourceName, status: "PAUSED" }, updateMask: "status" } })),
    ...result.keywords.map(({ adGroup, text, matchType }) => ({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword: { text, matchType } } } })),
    ...result.ads.map(({ adGroup, url, headlines, descriptions }) => ({ adGroupAdOperation: { create: { adGroup, status: "ENABLED", ad: { finalUrls: [url], responsiveSearchAd: { headlines: headlines.map(text => ({ text })), descriptions: descriptions.map(text => ({ text })) } } } } })),
  ];
}

/** Also used after an uncertain response. Never replays a create to find out whether it worked. */
export async function verifySearchImprovements(client: GoogleSearchClient, names: string[], pending: unknown): Promise<SearchImprovement> {
  const expected = searchImprovementSchema.parse(pending), condition = scope(client, names);
  if ([...expected.paused, ...expected.keywords.map(k => k.adGroup), ...expected.ads.map(a => a.adGroup)].some(name => !name.startsWith(`customers/${client.id}/`))) throw new Error("INVALID_RESOURCE_SCOPE");
  const [keywords, ads] = await Promise.all([
    client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative FROM ad_group_criterion WHERE ${condition} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`),
    expected.ads.length ? client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ${condition} AND ad_group_ad.status != 'REMOVED'`) : Promise.resolve([]),
  ]);
  for (const row of [...keywords, ...ads]) if (!names.includes(row.campaign.resourceName)) throw new Error("INVALID_RESOURCE_SCOPE");
  const paused = expected.paused.every(name => keywords.some(row => row.adGroupCriterion.resourceName === name && row.adGroupCriterion.status === "PAUSED"));
  const added = expected.keywords.every(k => keywords.filter(row => row.adGroup.resourceName === k.adGroup && !row.adGroupCriterion.negative && row.adGroupCriterion.status === "ENABLED" && row.adGroupCriterion.keyword.matchType === "EXACT" && normalized(row.adGroupCriterion.keyword.text) === normalized(k.text)).length === 1);
  const created = expected.ads.every(a => ads.filter(row => row.adGroup.resourceName === a.adGroup && row.adGroupAd.status === "ENABLED" && row.adGroupAd.ad.finalUrls.includes(a.url) && copyKey(row.adGroupAd.ad.responsiveSearchAd.headlines) === [...a.headlines].sort().join("\0") && copyKey(row.adGroupAd.ad.responsiveSearchAd.descriptions) === [...a.descriptions].sort().join("\0")).length === 1);
  if (!paused || !added || !created) throw new Error("OPTIMIZATION_REQUIRES_RECONCILIATION");
  return expected;
}
