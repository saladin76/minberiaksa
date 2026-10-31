import { z } from "zod";
import { SUPPORTED_LOCALES } from "../../locales";

const adLength = (s: string) => [...s].reduce((sum, char) => sum + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char) ? 2 : 1), 0);
const copy = (max: number) => z.string().trim().min(1).refine(s => adLength(s) <= max && !/[\r\n<>]/.test(s), `Maximum ${max} ad characters`);
export const searchPlanRequest = z.object({
  connectionId: z.string().regex(/^[a-f0-9]{24}$/i),
  prompt: z.string().trim().min(5).max(4000),
  locales: z.array(z.string().refine(x => (SUPPORTED_LOCALES as readonly string[]).includes(x))).min(1).max(19),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(30),
  projectIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(20),
  dailyBudget: z.number().positive().max(1000000),
  containsEuPoliticalAdvertising: z.boolean(),
}).strict();
export const keywordSchema = z.object({ text: z.string().trim().min(2).max(80), matchType: z.enum(["EXACT", "PHRASE"]) }).strict();
export const searchAutomationPolicy = z.object({
  enabled: z.boolean(), maxKeywordCost: z.number().positive().max(1e6),
  minClicks: z.number().int().min(10).max(10000),
  expandKeywords: z.boolean().default(false), refreshAds: z.boolean().default(false),
}).strict();
export type SearchAutomationPolicy = z.infer<typeof searchAutomationPolicy>;
export const searchAdCopy = z.object({
  headlines: z.array(copy(30)).min(3).max(15), descriptions: z.array(copy(90)).min(2).max(4),
}).strict().refine(value => new Set(value.headlines).size === value.headlines.length && new Set(value.descriptions).size === value.descriptions.length, "DUPLICATE_AD_COPY");
export const searchProposal = z.object({
  summary: z.string().max(4000),
  campaigns: z.array(z.object({
    locale: z.string(), name: copy(128), dailyBudgetMicros: z.number().int().positive().max(1e12),
    adGroups: z.array(z.object({
      name: copy(128), projectId: z.string().regex(/^[a-f0-9]{24}$/i),
      headlines: z.array(copy(30)).min(3).max(15), descriptions: z.array(copy(90)).min(2).max(4),
      keywords: z.array(keywordSchema).min(1).max(30),
      negativeKeywords: z.array(z.string().trim().min(2).max(80)).max(30),
      rationale: z.string().max(1000),
    }).strict()).min(1).max(8),
  }).strict()).min(1).max(19),
  expansion: z.array(z.object({ idea: z.string().max(1000), evidence: z.string().max(1000) }).strict()).max(10),
}).strict();
export type SearchPlanRequest = z.infer<typeof searchPlanRequest>;
export type SearchProposal = z.infer<typeof searchProposal>;
export type SearchDestination = { projectId: string; locale: string; title: string; description: string; url: string };

export function validateSearchProposal(value: unknown, input: SearchPlanRequest, destinations: SearchDestination[]): SearchProposal {
  const proposal = searchProposal.parse(value);
  if (proposal.campaigns.length !== input.locales.length) throw new Error("CAMPAIGN_LANGUAGE_MISSING");
  if (new Set(proposal.campaigns.map(c => c.locale)).size !== proposal.campaigns.length) throw new Error("DUPLICATE_CAMPAIGN_LANGUAGE");
  if (proposal.campaigns.reduce((sum, c) => sum + c.dailyBudgetMicros, 0) > Math.round(input.dailyBudget * 1e6)) throw new Error("BUDGET_EXCEEDED");
  for (const c of proposal.campaigns) {
    if (!input.locales.includes(c.locale)) throw new Error("LANGUAGE_NOT_APPROVED");
    for (const group of c.adGroups) {
      if (!input.projectIds.includes(group.projectId) || !destinations.some(d => d.projectId === group.projectId && d.locale === c.locale)) throw new Error("DESTINATION_NOT_AVAILABLE");
      if (new Set(group.headlines).size < 3 || new Set(group.descriptions).size < 2) throw new Error("DUPLICATE_AD_COPY");
      if (new Set(group.keywords.map(k => `${k.text.toLowerCase()}:${k.matchType}`)).size !== group.keywords.length) throw new Error("DUPLICATE_KEYWORD");
    }
  }
  return proposal;
}

export function buildSearchOperations(input: { customerId: string; planId: string; request: SearchPlanRequest; proposal: SearchProposal; destinations: SearchDestination[]; languages: Record<string, string>; locations: Record<string, string> }) {
  if (!/^\d{10}$/.test(input.customerId) || !/^[a-f0-9]{24}$/i.test(input.planId)) throw new Error("INVALID_RESOURCE_SCOPE");
  const proposal = validateSearchProposal(input.proposal, input.request, input.destinations);
  const resources = (type: string, id: number) => `customers/${input.customerId}/${type}/${id}`;
  const operations: Record<string, unknown>[] = []; let temporary = -1;
  for (const campaign of proposal.campaigns) {
    const budget = resources("campaignBudgets", temporary--), resource = resources("campaigns", temporary--);
    const name = `Minber ${input.planId} | ${campaign.locale} | ${campaign.name}`.slice(0, 128);
    operations.push({ campaignBudgetOperation: { create: { resourceName: budget, name, amountMicros: String(campaign.dailyBudgetMicros), deliveryMethod: "STANDARD", explicitlyShared: false } } });
    operations.push({ campaignOperation: { create: { resourceName: resource, name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget, maximizeConversions: {}, containsEuPoliticalAdvertising: input.request.containsEuPoliticalAdvertising ? "CONTAINS_EU_POLITICAL_ADVERTISING" : "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING", networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false }, geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" } } } });
    const language = input.languages[campaign.locale];
    if (!/^languageConstants\/\d+$/.test(language || "")) throw new Error("GOOGLE_LANGUAGE_UNAVAILABLE");
    operations.push({ campaignCriterionOperation: { create: { campaign: resource, language: { languageConstant: language } } } });
    for (const country of input.request.countries) {
      const location = input.locations[country];
      if (!/^geoTargetConstants\/\d+$/.test(location || "")) throw new Error("GOOGLE_LOCATION_UNAVAILABLE");
      operations.push({ campaignCriterionOperation: { create: { campaign: resource, location: { geoTargetConstant: location } } } });
    }
    for (const group of campaign.adGroups) {
      const adGroup = resources("adGroups", temporary--);
      const destination = input.destinations.find(d => d.projectId === group.projectId && d.locale === campaign.locale)!;
      const url = new URL(destination.url);
      if (url.protocol !== "https:" || url.hostname !== "minberiaksa.org") throw new Error("INVALID_SITE_DESTINATION");
      url.searchParams.set("utm_source", "google"); url.searchParams.set("utm_medium", "cpc"); url.searchParams.set("utm_campaign", `gs-${input.planId}`); url.searchParams.set("utm_content", campaign.locale);
      operations.push({ adGroupOperation: { create: { resourceName: adGroup, campaign: resource, name: group.name, status: "ENABLED", type: "SEARCH_STANDARD" } } });
      operations.push({ adGroupAdOperation: { create: { adGroup, status: "ENABLED", ad: { finalUrls: [url.toString()], responsiveSearchAd: { headlines: group.headlines.map(text => ({ text })), descriptions: group.descriptions.map(text => ({ text })) } } } } });
      for (const keyword of group.keywords) operations.push({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword } } });
      for (const text of group.negativeKeywords) operations.push({ adGroupCriterionOperation: { create: { adGroup, negative: true, keyword: { text, matchType: "EXACT" } } } });
    }
  }
  return operations;
}
