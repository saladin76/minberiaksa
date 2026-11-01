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
  localeWeights: z.record(z.string(), z.number().positive().max(100)).optional(),
  splitByCountry: z.boolean().optional(),
  cpcBidCeilingMicros: z.number().int().positive().max(1e12).optional(),
  // Populated only when explicitly adopting the surviving language/country campaigns.
  campaignTargets: z.array(z.object({locale:z.string(),country:z.string().regex(/^[A-Z]{2}$/).optional()}).strict()).min(1).max(570).optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.locales).size !== value.locales.length || new Set(value.countries).size !== value.countries.length || new Set(value.projectIds).size !== value.projectIds.length) context.addIssue({code:z.ZodIssueCode.custom,message:"DUPLICATE_TARGET"});
  if (value.localeWeights && (Object.keys(value.localeWeights).length !== value.locales.length || value.locales.some(locale=>!value.localeWeights![locale]) || Math.abs(Object.values(value.localeWeights).reduce((a,b)=>a+b,0)-100)>0.001)) context.addIssue({code:z.ZodIssueCode.custom,message:"LOCALE_WEIGHTS_MUST_TOTAL_100"});
  if(value.campaignTargets && (new Set(value.campaignTargets.map(t=>t.locale+":"+(t.country||""))).size!==value.campaignTargets.length || value.campaignTargets.some(t=>!value.locales.includes(t.locale) || (value.splitByCountry ? !t.country || !value.countries.includes(t.country) : Boolean(t.country))))) context.addIssue({code:z.ZodIssueCode.custom,message:"CAMPAIGN_TARGET_NOT_APPROVED"});
});
export const keywordSchema = z.object({ text: z.string().trim().min(2).max(80), matchType: z.enum(["EXACT", "PHRASE"]) }).strict();
export const searchAutomationPolicy = z.object({
  enabled: z.boolean(), maxKeywordCost: z.number().positive().max(1e6).optional(),
  minClicks: z.number().int().min(10).max(10000).optional(),
  minActiveKeywordsPerGroup: z.number().int().min(3).max(100).default(3),
  expandKeywords: z.boolean().default(false), refreshAds: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.enabled && (!value.maxKeywordCost || !value.minClicks)) context.addIssue({ code: z.ZodIssueCode.custom, message: "AUTOMATION_LIMITS_REQUIRED" });
});
export type SearchAutomationPolicy = z.infer<typeof searchAutomationPolicy>;
export const searchAdCopy = z.object({
  headlines: z.array(copy(30)).min(3).max(15), descriptions: z.array(copy(90)).min(2).max(4),
}).strict().refine(value => new Set(value.headlines).size === value.headlines.length && new Set(value.descriptions).size === value.descriptions.length, "DUPLICATE_AD_COPY");
export const searchProposal = z.object({
  summary: z.string().max(4000),
  biddingStrategy: z.enum(["MAXIMIZE_CLICKS","MAXIMIZE_CONVERSIONS"]).optional(),
  cpcBidCeilingMicros: z.number().int().positive().max(1e12).optional(),
  minCampaignDailyBudgetMicros: z.number().int().positive().max(1e12).optional(),
  campaigns: z.array(z.object({
    locale: z.string(), country: z.string().regex(/^[A-Z]{2}$/).optional(), name: copy(128), dailyBudgetMicros: z.number().int().positive().max(1e12),
    adGroups: z.array(z.object({
      name: copy(128), projectId: z.string().regex(/^[a-f0-9]{24}$/i),
      headlines: z.array(copy(30)).min(3).max(15), descriptions: z.array(copy(90)).min(2).max(4),
      keywords: z.array(keywordSchema).min(1).max(30),
      negativeKeywords: z.array(z.string().trim().min(2).max(80)).max(30),
      rationale: z.string().max(1000),
    }).strict()).min(1).max(8),
  }).strict()).min(1).max(570),
  expansion: z.array(z.object({ idea: z.string().max(1000), evidence: z.string().max(1000) }).strict()).max(10),
}).strict();
export type SearchPlanRequest = z.infer<typeof searchPlanRequest>;
export type SearchProposal = z.infer<typeof searchProposal>;
export type SearchDestination = { projectId: string; locale: string; title: string; description: string; url: string };

export function validateSearchProposal(value: unknown, input: SearchPlanRequest, destinations: SearchDestination[]): SearchProposal {
  const proposal = searchProposal.parse(value);
  const targets = input.campaignTargets || input.locales.flatMap<{locale:string;country?:string}>(locale=>input.splitByCountry ? input.countries.map(country=>({locale,country})) : [{locale,country:undefined}]);
  if (proposal.campaigns.length !== targets.length) throw new Error("CAMPAIGN_LANGUAGE_MISSING");
  if (new Set(proposal.campaigns.map(c => c.country ? c.locale+"-"+c.country : c.locale)).size !== proposal.campaigns.length) throw new Error("DUPLICATE_CAMPAIGN_LANGUAGE");
  if (proposal.campaigns.reduce((sum, c) => sum + c.dailyBudgetMicros, 0) > Math.round(input.dailyBudget * 1e6)) throw new Error("BUDGET_EXCEEDED");
  if(proposal.biddingStrategy==="MAXIMIZE_CLICKS" && !proposal.cpcBidCeilingMicros)throw new Error("CPC_CEILING_REQUIRED");
  for (const c of proposal.campaigns) {
    if (!input.locales.includes(c.locale)) throw new Error("LANGUAGE_NOT_APPROVED");
    if (!targets.some(t=>t.locale===c.locale && t.country===c.country)) throw new Error("CAMPAIGN_TARGET_NOT_APPROVED");
    if(proposal.minCampaignDailyBudgetMicros && c.dailyBudgetMicros<proposal.minCampaignDailyBudgetMicros)throw new Error(`BUDGET_TOO_SMALL_FOR_LOCALE:${c.locale}${c.country?"-"+c.country:""}`);
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
    const name = `Minber ${input.planId} | ${campaign.country ? campaign.locale+"-"+campaign.country : campaign.locale} | ${campaign.name}`.slice(0, 128);
    operations.push({ campaignBudgetOperation: { create: { resourceName: budget, name, amountMicros: String(campaign.dailyBudgetMicros), deliveryMethod: "STANDARD", explicitlyShared: false } } });
    operations.push({ campaignOperation: { create: { resourceName: resource, name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget, ...(proposal.biddingStrategy === "MAXIMIZE_CLICKS" ? {targetSpend:{cpcBidCeilingMicros:String(proposal.cpcBidCeilingMicros)}} : {maximizeConversions:{}}), containsEuPoliticalAdvertising: input.request.containsEuPoliticalAdvertising ? "CONTAINS_EU_POLITICAL_ADVERTISING" : "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING", networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false }, geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" } } } });
    const language = input.languages[campaign.locale];
    if (!/^languageConstants\/\d+$/.test(language || "")) throw new Error("GOOGLE_LANGUAGE_UNAVAILABLE");
    operations.push({ campaignCriterionOperation: { create: { campaign: resource, language: { languageConstant: language } } } });
    for (const country of campaign.country ? [campaign.country] : input.request.countries) {
      const location = input.locations[country];
      if (!/^geoTargetConstants\/\d+$/.test(location || "")) throw new Error("GOOGLE_LOCATION_UNAVAILABLE");
      operations.push({ campaignCriterionOperation: { create: { campaign: resource, location: { geoTargetConstant: location } } } });
    }
    for (const group of campaign.adGroups) {
      const adGroup = resources("adGroups", temporary--);
      const destination = input.destinations.find(d => d.projectId === group.projectId && d.locale === campaign.locale)!;
      const url = new URL(destination.url);
      if (url.protocol !== "https:" || url.hostname !== "minberiaksa.org") throw new Error("INVALID_SITE_DESTINATION");
      url.searchParams.set("utm_source", "google"); url.searchParams.set("utm_medium", "cpc"); url.searchParams.set("utm_campaign", `gs-${input.planId}`); url.searchParams.set("utm_content", campaign.country ? campaign.locale+"-"+campaign.country : campaign.locale);
      operations.push({ adGroupOperation: { create: { resourceName: adGroup, campaign: resource, name: group.name, status: "ENABLED", type: "SEARCH_STANDARD" } } });
      operations.push({ adGroupAdOperation: { create: { adGroup, status: "ENABLED", ad: { finalUrls: [url.toString()], responsiveSearchAd: { headlines: group.headlines.map(text => ({ text })), descriptions: group.descriptions.map(text => ({ text })) } } } } });
      for (const keyword of group.keywords) operations.push({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword } } });
      for (const text of group.negativeKeywords) operations.push({ adGroupCriterionOperation: { create: { adGroup, negative: true, keyword: { text, matchType: "EXACT" } } } });
    }
  }
  if(operations.length>10000)throw new Error("GOOGLE_MUTATION_LIMIT_EXCEEDED");
  return operations;
}

/** Integer micros, with every rounding remainder assigned once, to the last locale/country. */
export function searchBudgetAllocations(request: SearchPlanRequest) {
  const total=Math.round(request.dailyBudget*1e6);let assigned=0;
  return request.locales.flatMap((locale,index)=>{
    const amount=index===request.locales.length-1?total-assigned:Math.floor(total*(request.localeWeights?.[locale] ?? 100/request.locales.length)/100);assigned+=amount;
    const countries=request.splitByCountry?request.countries:[undefined];let used=0;
    return countries.map((country,i)=>{const budget=i===countries.length-1?amount-used:Math.floor(amount/countries.length);used+=budget;return {locale,...(country?{country}:{}),dailyBudgetMicros:budget};});
  });
}
