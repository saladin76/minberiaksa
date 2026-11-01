import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as contracts from "../../lib/marketing/google-search/contracts";
import {searchTestDependencies} from "./google-search-fixture";
const id="a".repeat(24),projectId="b".repeat(24);
function planningFixture({ready=true,conversions=0,tracking=true,currency="USD",rate=1}:{ready?:boolean;conversions?:number;tracking?:boolean;currency?:string;rate?:number}={}){
 let reads=0,creates=0;let saved:unknown;
 const client={query:async(q:string)=>{reads++;if(q.includes("FROM conversion_action"))return tracking?[{}]:[];if(q.includes("FROM customer"))return[{metrics:{conversions}}];if(q.includes("FROM language_constant"))return[{languageConstant:{code:"ar",resourceName:"languageConstants/1019"}},{languageConstant:{code:"en",resourceName:"languageConstants/1000"}}];return[{geoTargetConstant:{countryCode:"TR",resourceName:"geoTargetConstants/2792"}},{geoTargetConstant:{countryCode:"SA",resourceName:"geoTargetConstants/2682"}}];}};
 const report={currency,timezone:"Europe/Istanbul",period:{startDate:"2026-10-01",endDate:"2026-10-28"},campaigns:[],keywords:[],searchTerms:[]};
 const deps=searchTestDependencies({"@/lib/prisma":{prisma:{marketingPlatformConnection:{findFirst:async()=>{reads++;return{id};}},campaign:{findMany:async()=>[{id:projectId,title:"Arabic project",slug:"project",description:"Published project",translations:[{locale:"en",title:"English project",slug:"project",description:"Published project"}]}]},googleSearchPlan:{create:async({data}:{data:unknown})=>{creates++;saved=data;return{id,...data as object};}}}},"@/lib/campaign/soft-delete-filter":{NOT_SOFT_DELETED:{}},"@/lib/minbar/routes":{miaPath:(_key:string,locale:string,slug:string)=>`/${locale}/bagislar/${slug}`},"@/lib/exchange/rates-service":{loadRatesFromDatabase:async()=>({rates:{[currency]:rate}})},"@/lib/ai/core/openai-provider":{getOpenAiProviderStatus:async()=>({mode:ready?"ready":"unavailable"})},"@/lib/ai/core/ai-core-service":{},"../google-ads-report":{fetchGoogleAdsReport:async()=>{reads++;return report;}},"./client":{googleSearchClient:async()=>client,searchCredentials:()=>({})},"./contracts":contracts});
 const isolated={exports:{} as {prepareSearchPlan:(request:contracts.SearchPlanRequest,actor:string)=>Promise<{proposal:contracts.SearchProposal}>}};
 runInNewContext(ts.transpileModule(readFileSync("lib/marketing/google-search/planner.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:isolated,exports:isolated.exports,Date,Math,Intl,URL,Error,require:(name:string)=>{assert.ok(name in deps,name);return deps[name];}});
 const request=contracts.searchPlanRequest.parse({connectionId:id,prompt:"Prepare project donations",locales:["ar","en"],countries:["TR","SA"],projectIds:[projectId],dailyBudget:20,containsEuPoliticalAdvertising:false,splitByCountry:true,localeWeights:{ar:70,en:30},cpcBidCeilingMicros:500000});
 return{prepare:(changes:Partial<contracts.SearchPlanRequest>={})=>isolated.exports.prepareSearchPlan({...request,...changes},"fixture"),counts:()=>({reads,creates}),saved:()=>saved};
}
test("AI readiness precedes account research; low conversion accounts require CPC-limited clicks and account-wide 28-day evidence",async()=>{
 const offline=planningFixture({ready:false});await assert.rejects(offline.prepare(),/AI_PLANNER_NOT_READY/);assert.deepEqual(offline.counts(),{reads:0,creates:0});
 const low=await planningFixture().prepare();assert.equal(low.proposal.biddingStrategy,"MAXIMIZE_CLICKS");assert.equal(low.proposal.cpcBidCeilingMicros,500000);
 const high=await planningFixture({conversions:15}).prepare({cpcBidCeilingMicros:undefined});assert.equal(high.proposal.biddingStrategy,"MAXIMIZE_CONVERSIONS");
 const noTracking=await planningFixture({conversions:100,tracking:false}).prepare();assert.equal(noTracking.proposal.biddingStrategy,"MAXIMIZE_CLICKS");
 const missing=planningFixture();await assert.rejects(missing.prepare({cpcBidCeilingMicros:undefined}),/CPC_CEILING_REQUIRED/);assert.equal(missing.counts().creates,0);
});
test("minimum campaign budget uses stored account FX and rejects missing rates or underfunded language-country pairs before creating a plan",async()=>{
 const foreign=await planningFixture({currency:"TRY",rate:35}).prepare({dailyBudget:400});assert.equal(foreign.proposal.minCampaignDailyBudgetMicros,35000000);
 const tiny=planningFixture({currency:"TRY",rate:35});await assert.rejects(tiny.prepare(),/BUDGET_TOO_SMALL_FOR_LOCALE:ar-TR/);assert.equal(tiny.counts().creates,0);
 const noFx=planningFixture({currency:"TRY",rate:0});await assert.rejects(noFx.prepare(),/ACCOUNT_BUDGET_FX_UNAVAILABLE/);assert.equal(noFx.counts().creates,0);
});
