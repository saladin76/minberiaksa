/* eslint-disable @typescript-eslint/no-explicit-any -- Stateful provider and Prisma fault-injection boundary; all data is synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as contracts from '../../lib/marketing/google-search/contracts';
import {SearchApiError} from '../../lib/marketing/google-search/client';
import {searchTestDependencies} from './google-search-fixture';
import {optimizationWindow, selectKeywordsToPause} from '../../lib/marketing/google-search/optimization-safety';
type Row=Record<string,any>;
const id='a'.repeat(24), projectId='b'.repeat(24), account='1234567890', resource=(n:number)=>`customers/${account}/campaigns/${n}`,group=`customers/${account}/adGroups/12`;
function fixture(locales=['ar']) {
 const request={connectionId:id,prompt:'Synthetic project campaign',locales,countries:['TR'],projectIds:[projectId],dailyBudget:locales.length*10,containsEuPoliticalAdvertising:false};
 const proposal={summary:'Synthetic plan',campaigns:locales.map(locale=>({locale,name:'Fixture',dailyBudgetMicros:10_000_000,adGroups:[{name:'Fixture',projectId,headlines:['First headline','Second headline','Third headline'],descriptions:['Published project description one.','Published project description two.'],keywords:[{text:'project donation',matchType:'EXACT'}],negativeKeywords:[],rationale:'Published project'}]})),expansion:[]};
 const plan:Row={id,connectionId:id,title:'Fixture',request,proposal,status:'ACTIVE',version:1,resources:{campaigns:locales.map((_,i)=>resource(i+1))},evidence:{report:{currency:'USD',timezone:'Europe/Istanbul'}},automationEnabled:true,automationPolicy:{maxKeywordCost:5,minClicks:20},lastReviewAt:null,workLeaseToken:null,workLeaseUntil:null,updatedAt:new Date(0)};
 const campaigns=locales.map((locale,i)=>({campaign:{resourceName:resource(i+1),name:`Minber ${id} | ${locale} | Fixture`,status:'ENABLED',campaignBudget:`customers/${account}/campaignBudgets/${i+1}`},campaignBudget:{amountMicros:'10000000',explicitlyShared:false}}));
 const words=Array.from({length:4},(_,i)=>({campaign:{resourceName:resource(1)},adGroup:{resourceName:group},adGroupCriterion:{resourceName:`customers/${account}/adGroupCriteria/12~${i}`,status:'ENABLED',keyword:{text:'word '+i}},segments:{date:'2026-10-01'},metrics:{costMicros:6_000_000,clicks:30,conversions:0,impressions:50}}));
 const calls:Row[]=[];let tracking=true,mutateUnknown=false,onValidate:(()=>Promise<void>)|null=null,onLive:(()=>Promise<void>)|null=null,failFinal=false,connectionAvailable=true;
 function matches(row:Row,where:Row):boolean{return Object.entries(where).every(([key,w])=>{if(key==='OR')return w.some((x:Row)=>matches(row,x));const v=row[key];if(w instanceof Date)return v instanceof Date&&+v===+w;if(w&&typeof w==='object'){if('gt'in w)return v>w.gt;if('lte'in w)return v<=w.lte;if('isSet'in w)return(v!==undefined)===w.isSet;if('in'in w)return w.in.includes(v);}return v===w;});}
 const db:Row={marketingPlatformConnection:{findFirst:async()=>connectionAvailable?{id}:null},googleSearchPlan:{findUnique:async()=>structuredClone(plan),findUniqueOrThrow:async()=>structuredClone(plan),findFirst:async({where}:Row)=>matches(plan,where)?structuredClone(plan):null,updateMany:async({where,data}:Row)=>{
  if(!matches(plan,where))return{count:0};if(failFinal&&data.evidence?.optimization&&data.status==='ACTIVE'){failFinal=false;return{count:0};}
  for(const[key,value]of Object.entries(data))plan[key]=value&&typeof value==='object'&&'increment'in value?Number(plan[key])+Number((value as Row).increment):structuredClone(value);return{count:1};
 }}};
 const client:Row={id:account,query:async(query:string)=>{
  calls.push({query});if(query.includes('FROM conversion_action'))return tracking?[{conversionAction:{resourceName:'fixture'}}]:[];
  if(query.includes('FROM customer'))return[{customer:{currencyCode:'USD',timeZone:'Europe/Istanbul'}}];
  if(query.includes('FROM campaign'))return structuredClone(campaigns.filter(row=>(!query.includes("!= 'REMOVED'")||row.campaign.status!=='REMOVED')&&(!query.includes('campaign.resource_name IN')||query.includes(`'${row.campaign.resourceName}'`))));
  if(query.includes('FROM ad_group WHERE'))return[{adGroup:{resourceName:group}}];
  if(query.includes('FROM keyword_view'))return structuredClone(words.filter(row=>row.adGroupCriterion.status==='ENABLED'));
  if(query.includes('FROM ad_group_criterion'))return structuredClone(words.filter(row=>(!query.includes("status = 'ENABLED'")||row.adGroupCriterion.status==='ENABLED')&&(!query.includes('ad_group_criterion.resource_name IN')||query.includes(`'${row.adGroupCriterion.resourceName}'`))));
  throw Error('Unexpected GAQL: '+query);
 },call:async(method:string,body:Row)=>{
  assert.equal(method,'googleAds:mutate');calls.push(structuredClone(body));
  if(body.validateOnly){if(onValidate){const fn=onValidate;onValidate=null;await fn();}return{};}
  if(onLive){const fn=onLive;onLive=null;await fn();}
  if(mutateUnknown)throw new SearchApiError('GOOGLE_ADS_OUTCOME_UNKNOWN',502,true);
  const created:string[]=[];
  for(const operation of body.mutateOperations){
   if(operation.campaignOperation?.update){const update=operation.campaignOperation.update,row=campaigns.find(c=>c.campaign.resourceName===update.resourceName);if(row)row.campaign.status=update.status;}
   if(operation.campaignOperation?.remove){const row=campaigns.find(c=>c.campaign.resourceName===operation.campaignOperation.remove);if(row)row.campaign.status='REMOVED';}
   if(operation.adGroupCriterionOperation?.update){const update=operation.adGroupCriterionOperation.update,row=words.find(w=>w.adGroupCriterion.resourceName===update.resourceName);if(row)row.adGroupCriterion.status=update.status;}
   if(operation.campaignOperation?.create){const c=operation.campaignOperation.create,name=resource(campaigns.length+10);campaigns.push({campaign:{resourceName:name,name:c.name,status:c.status,campaignBudget:`customers/${account}/campaignBudgets/${campaigns.length+10}`},campaignBudget:{amountMicros:'10000000',explicitlyShared:false}});created.push(name);}
  }
  return{mutateOperationResponses:created.map(resourceName=>({campaignResult:{resourceName}}))};
 }};
 const deps:Row={'@/lib/prisma':{prisma:db},'./client':{SearchApiError,googleSearchClient:async()=>client,searchCredentials:()=>({})},'./contracts':contracts,'./planner':{searchDestinations:async()=>locales.map(locale=>({projectId,locale,title:'Fixture',description:'Fixture',url:`https://minberiaksa.org/${locale}/bagislar/fixture`})),searchTargeting:async()=>({languages:Object.fromEntries(locales.map(locale=>[locale,'languageConstants/1000'])),locations:{TR:'geoTargetConstants/2792'}})},'./growth':{collectSearchGrowth:async()=>({status:'READY',at:new Date().toISOString(),budgets:[],terms:[]})},'./improvements':{collectSearchImprovements:async()=>{throw Error('Not enabled');},searchImprovementOperations:(v:Row)=>v.paused.map((resourceName:string)=>({adGroupCriterionOperation:{update:{resourceName,status:'PAUSED'},updateMask:'status'}})),verifySearchImprovements:async(_c:unknown,_n:unknown,v:Row)=>{assert.ok(v.paused.every((name:string)=>words.some(w=>w.adGroupCriterion.resourceName===name&&w.adGroupCriterion.status==='PAUSED')));}}};
 const modules=searchTestDependencies(deps);
 function load(name:string){const m={exports:{}as Row};runInNewContext(ts.transpileModule(readFileSync(`lib/marketing/google-search/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Date,Error,Intl,URL,Buffer,console,require:(key:string)=>{assert.ok(key in modules,key);return modules[key];}});return m.exports;}
 const executor=load('executor'),optimizer=load('optimizer'),emergency=modules['./emergency-pause'] as Row;
 return{state:()=>plan,campaigns,words,calls,execute:(action:string,extra:Row={})=>executor.executeSearchPlan({id,version:plan.version,action,...extra}),optimize:()=>optimizer.optimizeSearchPlan(id,new Date('2026-11-01T12:00:00Z')),pause:()=>emergency.emergencyPauseSearchPlan(id),noTracking:()=>{tracking=false;},noConnection:()=>{connectionAvailable=false;},unknown:()=>{mutateUnknown=true;},atValidate:(fn:()=>Promise<void>)=>{onValidate=fn;},atLive:(fn:()=>Promise<void>)=>{onLive=fn;},failFinal:()=>{failFinal=true;}};
}
const liveMutations=(f:ReturnType<typeof fixture>)=>f.calls.filter(row=>row.mutateOperations&&!row.validateOnly);

test('conversion tracking is required both at activation and at every optimization cycle',async()=>{
 const activation=fixture();activation.state().automationEnabled=false;activation.noTracking();await assert.rejects(activation.execute('automation',{confirmation:'ENABLE_BOUNDED_OPTIMIZATION',policy:{enabled:true,maxKeywordCost:5,minClicks:20}}),/CONVERSION_TRACKING_REQUIRED/);assert.equal(liveMutations(activation).length,0);assert.equal(activation.state().automationEnabled,false);
 const cycle=fixture();cycle.noTracking();await cycle.optimize();assert.equal(liveMutations(cycle).length,0);assert.equal(cycle.state().automationEnabled,false);assert.equal(cycle.state().lastError,'CONVERSION_TRACKING_REQUIRED');
});
test('four costly zero-conversion keywords leave exactly three enabled; young words are untouched',async()=>{
 const f=fixture();f.words[3].segments.date='2026-10-30';await f.optimize();assert.equal(f.words.filter(w=>w.adGroupCriterion.status==='PAUSED').length,1);assert.equal(f.words.filter(w=>w.adGroupCriterion.status==='ENABLED').length,3);assert.equal(f.words[3].adGroupCriterion.status,'ENABLED');assert.equal(f.state().evidence.optimization.history.length,1);
 const window=optimizationWindow(new Date('2026-11-01T01:30:00Z'),'America/Los_Angeles');assert.equal(window.until,'2026-10-28');assert.equal(window.since,'2026-10-21');
 assert.equal(selectKeywordsToPause(f.words as never,f.words as never,[] as never,3,{minClicks:20,maxKeywordCost:5},'2026-10-25').length,0);
});
test('restoration uses only the recorded automatic-pause history, validates and verifies, and keeps history',async()=>{
 const f=fixture();await f.optimize();const previously=f.words.filter(w=>w.adGroupCriterion.status==='PAUSED').map(w=>w.adGroupCriterion.resourceName);assert.equal(previously.length,1);f.words[3].adGroupCriterion.status='PAUSED';
 await f.execute('restore-keywords',{confirmation:'RESTORE_AUTOMATION_KEYWORDS'});assert.equal(f.words[3].adGroupCriterion.status,'PAUSED');assert.ok(previously.every(id=>f.words.some(w=>w.adGroupCriterion.resourceName===id&&w.adGroupCriterion.status==='ENABLED')));assert.equal(f.state().evidence.optimization.history.length,2);
 const before=liveMutations(f).length;await f.execute('restore-keywords',{confirmation:'RESTORE_AUTOMATION_KEYWORDS'});assert.equal(liveMutations(f).length,before);
});
test('emergency pause bypasses a live lease and stale revision, and disabling monitoring needs no old thresholds',async()=>{
 const f=fixture();f.state().workLeaseToken='another-worker';f.state().workLeaseUntil=new Date(Date.now()+600000);f.campaigns[0].campaign.name='Renamed externally';await f.execute('pause',{version:0});assert.equal(f.state().status,'PAUSED');assert.equal(f.state().automationEnabled,false);assert.equal(f.state().workLeaseToken,'another-worker');assert.equal(f.campaigns[0].campaign.status,'PAUSED');assert.equal(liveMutations(f)[0].partialFailure,true);
 const disabled=fixture();disabled.state().automationPolicy=null;disabled.noConnection();await disabled.execute('automation',{policy:{enabled:false}});assert.equal(disabled.state().automationEnabled,false);assert.equal(disabled.calls.length,0);
});
test('an emergency during validation invalidates the worker before its live mutation',async()=>{
 const f=fixture();f.atValidate(f.pause);await f.optimize();assert.equal(f.state().automationEnabled,false);assert.equal(f.state().status,'PAUSED');assert.equal(f.words.filter(w=>w.adGroupCriterion.status==='PAUSED').length,0);assert.equal(liveMutations(f).length,1);
});
test('a final CAS failure never loses the history of an already verified provider mutation',async()=>{
 const f=fixture();f.failFinal();await f.optimize();assert.equal(f.state().status,'RECONCILE_REQUIRED');assert.equal(f.state().automationEnabled,false);assert.equal(f.state().evidence.optimization.history.length,1);assert.equal(f.state().evidence.optimization.history[0].pausedKeywords.length,1);
});
test('an unknown create with no Google resources reconciles to VALIDATED and can create once again',async()=>{
 const f=fixture();f.campaigns.length=0;f.state().resources=null;f.state().status='RECONCILE_REQUIRED';f.state().automationEnabled=false;await f.execute('reconcile');assert.equal(f.state().status,'VALIDATED');assert.equal(f.state().resources,null);assert.equal(liveMutations(f).length,0);
 await f.execute('create',{confirmation:'CREATE_PAUSED',dailyBudget:10,currency:'USD'});assert.equal(f.state().status,'PAUSED');assert.equal(liveMutations(f).length,1);
});
test('partial creation has functioning adoption and removal paths, without editing unrelated campaigns',async()=>{
 for(const action of ['adopt-existing','discard-partial']){const f=fixture(['ar','en']);f.campaigns.pop();f.state().resources=null;f.state().status='RECONCILE_REQUIRED';await f.execute('reconcile');assert.equal(f.state().status,'PARTIAL_PROVIDER_STATE');
 await f.execute(action,{confirmation:action==='adopt-existing'?'ADOPT_EXISTING_CAMPAIGNS':'REMOVE_PARTIAL_CAMPAIGNS',newDailyBudget:10,currency:'USD'});assert.equal(f.state().status,action==='adopt-existing'?'ACTIVE':'VALIDATED');if(action==='adopt-existing'){assert.deepEqual(Array.from(f.state().request.locales),['ar']);assert.equal(f.state().request.dailyBudget,10);}else{assert.equal(f.campaigns[0].campaign.status,'REMOVED');assert.equal(f.state().resources,null);}}
});
test('renamed resources reconcile by saved IDs and a changed Google budget requires explicit adoption',async()=>{
 const f=fixture();f.state().status='RECONCILE_REQUIRED';f.campaigns[0].campaign.name='External rename';await f.execute('reconcile');assert.equal(f.state().status,'ACTIVE');f.campaigns[0].campaignBudget.amountMicros='25000000';await assert.rejects(f.execute('budget',{confirmation:'CHANGE_BUDGET',dailyBudget:10,newDailyBudget:20,currency:'USD'}),/PROVIDER_BUDGET_CHANGED_REVIEW_REQUIRED/);
 await assert.rejects(f.execute('adopt-provider-budget',{confirmation:'ADOPT_PROVIDER_BUDGET',newDailyBudget:24,currency:'USD'}),/PROVIDER_BUDGET_CHANGED_RELOAD/);assert.equal(f.state().request.dailyBudget,10);
 await f.execute('adopt-provider-budget',{confirmation:'ADOPT_PROVIDER_BUDGET',newDailyBudget:25,currency:'USD'});assert.equal(f.state().request.dailyBudget,25);assert.equal(f.state().proposal.campaigns[0].dailyBudgetMicros,25000000);assert.equal(liveMutations(f).length,0);
});
test('archiving a failed draft does not require Google credentials or a valid generated proposal',async()=>{
 const f=fixture();f.state().status='PLANNING_FAILED';f.state().resources=null;f.state().proposal={campaigns:[]};f.noConnection();await f.execute('archive',{confirmation:'ARCHIVE_PLAN'});assert.equal(f.state().status,'ARCHIVED');assert.equal(f.calls.length,0);
});


test('an emergency overtaking a live enable remains unconfirmed until a second pause verifies the settled operation',async()=>{
 const f=fixture();f.state().status='PAUSED';f.campaigns[0].campaign.status='PAUSED';f.atLive(async()=>{await f.pause();});
 await assert.rejects(f.execute('enable',{confirmation:'ENABLE_CAMPAIGNS',dailyBudget:10,currency:'USD'}),/PLAN_CHANGED_RELOAD/);
 assert.equal(f.campaigns[0].campaign.status,'ENABLED');assert.equal(f.state().status,'RECONCILE_REQUIRED');assert.equal(f.state().automationEnabled,false);assert.equal(f.state().evidence.emergencyPausePending,true);assert.equal(f.state().evidence.emergencyPause.confirmed,false);
 await f.pause();assert.equal(f.campaigns[0].campaign.status,'PAUSED');assert.equal(f.state().evidence.emergencyPausePending,false);assert.equal(f.state().evidence.emergencyPause.confirmed,true);
});
test('creation finishing after an emergency retains actual resource IDs and schedules verification without enabling ads',async()=>{
 const f=fixture();f.campaigns.length=0;f.state().resources=null;f.state().status='VALIDATED';f.state().automationEnabled=false;f.atLive(async()=>{await f.pause();});
 await assert.rejects(f.execute('create',{confirmation:'CREATE_PAUSED',dailyBudget:10,currency:'USD'}),/PLAN_CHANGED_RELOAD/);
 assert.equal(f.campaigns.length,1);assert.equal(f.campaigns[0].campaign.status,'PAUSED');assert.equal(f.state().resources.campaigns[0],f.campaigns[0].campaign.resourceName);assert.equal(f.state().evidence.emergencyPausePending,true);
 await f.pause();assert.equal(f.state().evidence.emergencyPause.confirmed,true);assert.equal(f.state().status,'PAUSED');
});
