import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildSearchOperations, searchPlanRequest, searchProposal, searchPlanRequest as parseRequest, searchAutomationPolicy, validateSearchProposal, type SearchPlanRequest, type SearchProposal } from "../../lib/marketing/google-search/contracts";
import { googleSearchClient, SearchApiError } from "../../lib/marketing/google-search/client";
import { recurringReadiness } from "../../lib/donations/recurring-readiness";
import { collectSearchGrowth } from "../../lib/marketing/google-search/growth";
const id = "507f1f77bcf86cd799439011", projectId = "507f1f77bcf86cd799439012";
const request: SearchPlanRequest = { connectionId: id, prompt: "Winter donation campaign", locales: ["ar"], countries: ["TR"], projectIds: [projectId], dailyBudget: 10, containsEuPoliticalAdvertising: false };
const proposal: SearchProposal = { summary: "Measured proposal", campaigns: [{ locale: "ar", name: "Winter", dailyBudgetMicros: 10000000, adGroups: [{ name: "Warmth", projectId, headlines: ["Warm winter", "Support families", "Donate today"], descriptions: ["Support the published winter project.", "Give through the foundation's website."], keywords: [{ text: "winter donation", matchType: "EXACT" }], negativeKeywords: ["jobs"], rationale: "Relevant published destination" }] }], expansion: [] };
const destinations = [{ projectId, locale: "ar", title: "Winter", description: "Published description", url: "https://minberiaksa.org/ar/bagislar/winter" }];
const operationInput = { customerId: "1234567890", planId: id, request, proposal, destinations, languages: { ar: "languageConstants/1019" }, locations: { TR: "geoTargetConstants/2792" } };
test("Google Search creation has one budget allocation, paused campaigns, scoped destinations and unique temporary IDs", () => {
  const operations = buildSearchOperations(operationInput);
  const rows = operations as Record<string, { create: Record<string, unknown> }>[];
  const campaign = rows.find(row => row.campaignOperation)!.campaignOperation.create;
  assert.equal(campaign.status, "PAUSED");
  assert.equal(campaign.advertisingChannelType, "SEARCH");
  assert.equal(rows.filter(row => row.campaignBudgetOperation).length, 1);
  assert.equal(rows.find(row => row.campaignBudgetOperation)!.campaignBudgetOperation.create.amountMicros, "10000000");
  const names = rows.flatMap(row => Object.values(row).map(op => op.create.resourceName).filter(Boolean));
  assert.equal(new Set(names).size, names.length);
  const ad = rows.find(row => row.adGroupAdOperation)!.adGroupAdOperation.create.ad as { finalUrls: string[] };
  const url = new URL(ad.finalUrls[0]); assert.equal(url.hostname, "minberiaksa.org"); assert.equal(url.searchParams.get("utm_campaign"), `gs-${id}`);
  assert.equal(rows.some(row => row.remove), false);
});
test("Search plans refuse budget overflow, unselected languages/projects, long copy, duplicate copy and external destinations", () => {
  assert.throws(() => validateSearchProposal({ ...proposal, campaigns: [{ ...proposal.campaigns[0], dailyBudgetMicros: 10000001 }] }, request, destinations), /BUDGET_EXCEEDED/);
  assert.throws(() => validateSearchProposal(proposal, { ...request, locales: ["ar", "en"] }, destinations), /CAMPAIGN_LANGUAGE_MISSING/);
  assert.throws(() => validateSearchProposal({ ...proposal, campaigns: [{ ...proposal.campaigns[0], locale: "en" }] }, request, destinations), /LANGUAGE_NOT_APPROVED/);
  const bad = structuredClone(proposal); bad.campaigns[0].adGroups[0].headlines[1] = bad.campaigns[0].adGroups[0].headlines[0];
  assert.throws(() => validateSearchProposal(bad, request, destinations), /DUPLICATE_AD_COPY/);
  bad.campaigns[0].adGroups[0].headlines[1] = "A".repeat(31); assert.equal(searchProposal.safeParse(bad).success, false);
  assert.throws(() => buildSearchOperations({ ...operationInput, destinations: [{ ...destinations[0], url: "https://evil.example/ad" }] }), /INVALID_SITE_DESTINATION/);
  assert.equal(searchPlanRequest.safeParse({ ...request, countries: ["TR') OR 1=1"] }).success, false);
});

const credentials = { customerId: "1234567890", developerToken: "private-developer", clientId: "private-client", clientSecret: "private-secret", refreshToken: "private-refresh" };
test("Google reads paginate without arbitrary hosts and redact upstream failures", async () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: "private-access" });
    const body = JSON.parse(String(init?.body)); requests.push({ url: String(url), body });
    return Response.json(body.pageToken ? { results: [{ campaign: { name: "second" } }] } : { results: [{ campaign: { name: "first" } }], nextPageToken: "page-2" });
  };
  const client = await googleSearchClient(credentials, fetcher); const rows = await client.query("SELECT campaign.name FROM campaign");
  assert.equal(rows.length, 2); assert.equal(requests[1].body.pageToken, "page-2"); assert.ok(requests.every(row => row.url.startsWith("https://googleads.googleapis.com/v26/customers/1234567890/")));
  const failure = await googleSearchClient(credentials, async url => String(url).includes("oauth2.googleapis.com") ? Response.json({ access_token: "private-access" }) : Response.json({ error: { message: "private-access private-secret", details: [{ errors: [{ errorCode: { requestError: "INVALID_INPUT" } }] }] } }, { status: 400 }));
  await assert.rejects(failure.call("googleAds:mutate", { validateOnly: true }), error => error instanceof SearchApiError && error.message.includes("INVALID_INPUT") && !error.message.includes("private"));
});

function executorHarness(uncertain = false) {
  let plan = { id, connectionId: id, title: "Winter", status: "VALIDATED", version: 1, request, proposal, evidence: {}, resources: null as unknown, updatedAt: new Date(0), workLeaseUntil: null };
  let creations = 0, validations = 0;
  const campaigns: Record<string, unknown>[] = [];
  const db = { marketingPlatformConnection: { findFirst: async () => ({ id }) }, googleSearchPlan: {
    findUnique: async () => structuredClone(plan), findUniqueOrThrow: async () => structuredClone(plan),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.version !== plan.version || where.status !== plan.status) return { count: 0 };
      plan = { ...plan, ...data, version: plan.version + 1 } as typeof plan; return { count: 1 };
    }, update: async ({ data }: { data: Record<string, unknown> }) => { plan = { ...plan, ...data, version: plan.version + 1 } as typeof plan; return structuredClone(plan); },
  } };
  const client = { id: "1234567890", query: async (query: string) => query.includes("FROM customer") ? [{ customer: { currencyCode: "USD" } }] : campaigns,
    call: async (_method: string, body: { validateOnly: boolean }) => {
      if (body.validateOnly) { validations++; return {}; }
      creations++; if (uncertain) throw new SearchApiError("GOOGLE_ADS_OUTCOME_UNKNOWN", 502, true);
      campaigns.push({ campaign: { resourceName: "customers/1234567890/campaigns/123", name: `Minber ${id} | ar | Winter`, status: "PAUSED", campaignBudget: "customers/1234567890/campaignBudgets/124" }, campaignBudget: { amountMicros: "10000000", explicitlyShared: false } });
      return { mutateOperationResponses: [{ campaignResult: { resourceName: "customers/1234567890/campaigns/123" } }] };
    } };
  const dependencies: Record<string, unknown> = { "@/lib/prisma": { prisma: db }, "./client": { SearchApiError, googleSearchClient: async () => client, searchCredentials: () => credentials }, "./contracts": { searchPlanRequest, searchProposal, searchAutomationPolicy, buildSearchOperations }, "./improvements": {verifySearchImprovements:async()=>{}}, "./planner": { searchDestinations: async () => destinations, searchTargeting: async () => ({ languages: operationInput.languages, locations: operationInput.locations }) } };
  const isolated = { exports: {} as { executeSearchPlan: (body: Record<string, unknown>) => Promise<unknown> } };
  const code = ts.transpileModule(fs.readFileSync("lib/marketing/google-search/executor.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: isolated, exports: isolated.exports, Date, Map, URL, JSON, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { execute: isolated.exports.executeSearchPlan, plan: () => plan, counts: () => ({ creations, validations }) };
}
test("two concurrent create requests can create exactly one paused Google hierarchy", async () => {
  const h = executorHarness(); const body = { id, version: 1, action: "create", confirmation: "CREATE_PAUSED", dailyBudget: 10, currency: "USD" };
  const results = await Promise.allSettled([h.execute(body), h.execute(body)]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(h.counts().creations, 1); assert.equal(h.plan().status, "PAUSED");
});
test("unknown creation outcomes block replay and activation requires the specific budget approval", async () => {
  const h = executorHarness(true);
  await assert.rejects(h.execute({ id, version: 1, action: "create", confirmation: "CREATE_PAUSED", dailyBudget: 10, currency: "USD" }), /OUTCOME_UNKNOWN/);
  assert.equal(h.plan().status, "RECONCILE_REQUIRED");
  await assert.rejects(h.execute({ id, version: h.plan().version, action: "create", confirmation: "CREATE_PAUSED", dailyBudget: 10, currency: "USD" }), /PLAN_NOT_CREATABLE/);
  assert.equal(h.counts().creations, 1);
  const approved = executorHarness(); await assert.rejects(approved.execute({ id, version: 1, action: "create", confirmation: "CREATE_PAUSED", dailyBudget: 11, currency: "USD" }), /EXPLICIT_BUDGET_APPROVAL_REQUIRED/); assert.equal(approved.counts().creations, 0);
});
test("recurring readiness separates unpaid, missing authorization, due and provider-managed plans", () => {
  const base = { status: "ACTIVE", provider: "ALBARAKA", lastBillingDate: new Date("2026-10-01"), paymentCardId: "card", nextBillingDate: new Date("2026-10-20") };
  const now = new Date("2026-10-27");
  assert.equal(recurringReadiness(base, now), "due");
  assert.equal(recurringReadiness({ ...base, hasPaidDonation: false }, now), "awaiting_first_payment");
  assert.equal(recurringReadiness({ ...base, paymentCardId: null }, now), "authorization_missing");
  assert.equal(recurringReadiness({ ...base, billingLeaseUntil: new Date("2026-10-28") }, now), "processing");
  assert.equal(recurringReadiness({ ...base, provider: "STRIPE", stripeSubscriptionId: "provider-plan" }, now), "provider_managed");
});

test('automatic Search monitoring is opt-in, bounded to five owned keywords, and never changes a budget', async () => {
  async function run(enabled: boolean, outside = false) {
    let plan = { id, connectionId: id, status: 'ACTIVE', version: 1, automationEnabled: enabled, automationPolicy: { maxKeywordCost: 5, minClicks: 20 }, proposal, evidence: {}, resources: { campaigns: ['customers/1234567890/campaigns/123'] }, lastReviewAt: null as Date|null, workLeaseToken: null as string|null, workLeaseUntil: null as Date|null, lastError: null as string|null };
    const mutations: {validateOnly:boolean;mutateOperations:Record<string,unknown>[]}[] = [];
    const client = { id:'1234567890', query:async (query:string) => query.includes('FROM campaign') ? [{campaign:{resourceName:'customers/1234567890/campaigns/123',name:`Minber ${id} | ar | Winter`,status:'ENABLED'},campaignBudget:{amountMicros:'10000000',explicitlyShared:false}}] : query.includes('FROM keyword_view') ? Array.from({length:8},(_,i)=>({campaign:{resourceName:outside?'customers/1234567890/campaigns/999':'customers/1234567890/campaigns/123'},adGroupCriterion:{resourceName:`customers/1234567890/adGroupCriteria/12~${i}`,keyword:{text:'winter '+i}},metrics:{clicks:30,costMicros:6000000,conversions:0}})) : Array.from({length:5},(_,i)=>({adGroupCriterion:{resourceName:`customers/1234567890/adGroupCriteria/12~${i}`,status:'PAUSED'}})),call:async (_method:string,body:{validateOnly:boolean;mutateOperations:Record<string,unknown>[]})=>{mutations.push(body);return {}} };
    const db={marketingPlatformConnection:{findFirst:async()=>({id})},googleSearchPlan:{findUnique:async()=>plan,findFirst:async()=>plan,updateMany:async({data}:{data:Record<string,unknown>})=>{plan={...plan,...data,version:typeof data.version==='object'?plan.version+1:plan.version} as typeof plan;return {count:1}}}};
    const deps:Record<string,unknown>={'node:crypto':{randomUUID:()=> 'lease'},'@/lib/prisma':{prisma:db},'@/lib/audit-log':{queueAuditLog:()=>{}},'./client':{SearchApiError,googleSearchClient:async()=>client,searchCredentials:()=>credentials},'./executor':{jsonValue:(v:unknown)=>v},'./contracts':{searchProposal,searchPlanRequest:parseRequest,searchAutomationPolicy},'./planner':{},'./improvements':{searchImprovementOperations:(value:{paused:string[]})=>value.paused.map(resourceName=>({adGroupCriterionOperation:{update:{resourceName,status:'PAUSED'},updateMask:'status'}})),verifySearchImprovements:async()=>{}},'./growth':{collectSearchGrowth}};
    const loaded={exports:{} as {optimizeSearchPlan:(id:string,now:Date)=>Promise<void>}};
    const code=ts.transpileModule(fs.readFileSync('lib/marketing/google-search/optimizer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new vm.Script(code).runInNewContext({module:loaded,exports:loaded.exports,Date,Number,RegExp,JSON,require:(name:string)=>{assert.ok(name in deps,name);return deps[name]}});
    await loaded.exports.optimizeSearchPlan(id,new Date('2026-10-27T10:00:00Z'));return {plan,mutations};
  }
  assert.equal((await run(false)).mutations.length,0);
  const scoped=await run(true);assert.equal(scoped.mutations.length,2);assert.equal(scoped.mutations[0].validateOnly,true);assert.equal(scoped.mutations[1].validateOnly,false);assert.equal(scoped.mutations[1].mutateOperations.length,5);
  assert.ok(scoped.mutations[1].mutateOperations.every(op=>Object.keys(op).join()==='adGroupCriterionOperation'));
  const outside=await run(true,true);assert.equal(outside.mutations.length,0);assert.equal(outside.plan.lastError,'INVALID_RESOURCE_SCOPE');
});

test('durable multilingual planning admits one worker and resumes without repeating completed languages', async () => {
  const planRequest = { ...request, locales: ['ar', 'en', 'tr'], dailyBudget: 30 };
  let plan = { id, connectionId:id, status:'PLANNING',version:1,request:planRequest,proposal:{summary:'',campaigns:[] as SearchProposal['campaigns'],expansion:[]},evidence:{destinations:planRequest.locales.map(locale=>({...destinations[0],locale,url:`https://minberiaksa.org/${locale}/bagislar/winter`})),report:{currency:'USD',timezone:'Europe/Istanbul'},targeting:{languages:{ar:'languageConstants/1019',en:'languageConstants/1000',tr:'languageConstants/1037'},locations:{TR:'geoTargetConstants/2792'}},keywords:[],researchWarnings:[],completedLocales:[] as string[],summaries:[] as string[]},workLeaseToken:null as string|null,workLeaseUntil:null as Date|null,lastError:null as string|null };
  const generated:string[]=[];let failEnglish=true;
  const db={marketingPlatformConnection:{findFirst:async()=>({id})},googleSearchPlan:{findUnique:async()=>structuredClone(plan),updateMany:async({where,data}:{where:Record<string,unknown>;data:Record<string,unknown>})=>{
    if(where.version!==undefined&&where.version!==plan.version||where.status!==undefined&&where.status!==plan.status||where.workLeaseToken!==undefined&&where.workLeaseToken!==plan.workLeaseToken||where.OR&&plan.workLeaseUntil&&plan.workLeaseUntil.getTime()>Date.now())return {count:0};
    plan={...plan,...data,version:typeof data.version==='object'?plan.version+1:plan.version} as typeof plan;return {count:1};
  }}};
  const dependencies:Record<string,unknown>={'@/lib/prisma':{prisma:db},'@/lib/campaign/soft-delete-filter':{NOT_SOFT_DELETED:{}},'@/lib/minbar/routes':{},'node:crypto':{randomUUID:()=>String(Math.random())},'@/lib/ai/core/openai-provider':{getOpenAiProviderStatus:()=>({mode:'ready'}),generateOpenAiDraft:async(input:{prompt:string})=>{
    const target=JSON.parse(input.prompt).request;const locale=target.locales[0];generated.push(locale);if(locale==='en'&&failEnglish){failEnglish=false;throw new Error('TEMPORARY_PLANNER_FAILURE')}
    return {status:'COMPLETED',mode:'OPENAI',answer:JSON.stringify({...proposal,campaigns:[{...proposal.campaigns[0],locale,dailyBudgetMicros:Math.round(target.dailyBudget*1e6)}]})};
  }},'@/lib/ai/core/ai-core-service':{getAiContext:()=>({})},'../google-ads-report':{},'./client':{searchCredentials:()=>credentials,googleSearchClient:async()=>({call:async()=>({results:[]})})},'./contracts':{searchPlanRequest,validateSearchProposal}};
  const load=()=>{const loaded={exports:{} as {continueSearchPlanning:(id:string)=>Promise<void>}};const code=ts.transpileModule(fs.readFileSync('lib/marketing/google-search/planner.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new vm.Script(code).runInNewContext({module:loaded,exports:loaded.exports,Date,Number,Math,JSON,URL,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name]}});return loaded.exports.continueSearchPlanning};
  await Promise.all([load()(id),load()(id)]);assert.deepEqual(generated,['ar']);assert.deepEqual(Array.from(plan.evidence.completedLocales),['ar']);
  await load()(id);assert.equal(plan.status,'PLANNING_FAILED');assert.deepEqual(Array.from(plan.evidence.completedLocales),['ar']);
  plan.status='PLANNING';plan.version++;
  await load()(id);await load()(id);assert.equal(plan.status,'DRAFT');assert.deepEqual(generated,['ar','en','en','tr']);assert.equal(plan.proposal.campaigns.length,3);assert.equal(plan.proposal.campaigns.reduce((sum,c)=>sum+c.dailyBudgetMicros,0),30000000);
});
