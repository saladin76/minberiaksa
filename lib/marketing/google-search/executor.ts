import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { SearchApiError, googleSearchClient, searchCredentials, type GoogleSearchClient } from "./client";
import { buildSearchOperations, searchPlanRequest, searchProposal, searchAutomationPolicy, type SearchAutomationPolicy, type SearchDestination } from "./contracts";
import { searchDestinations, searchTargeting } from "./planner";
import { verifySearchImprovements } from "./improvements";

import { jsonValue } from "./json";
import { withPlanLease } from "./lease";
import { emergencyPauseSearchPlan } from "./emergency-pause";
import { requireConversionTracking, appendOptimizationHistory, optimizationHistory } from "./optimization-safety";
import { proposalCampaignForResource, searchCampaignKey } from "./scope";
export { jsonValue } from "./json";
type ActionInput = { id: string; version: number; action: "validate" | "create" | "enable" | "pause" | "budget" | "automation" | "reconcile" | "restore-keywords" | "adopt-provider-budget" | "discard-partial" | "adopt-existing" | "detach" | "archive"; confirmation?: string; dailyBudget?: number; newDailyBudget?: number; currency?: string; policy?: SearchAutomationPolicy };
type Resources = { campaigns: string[]; campaignKeys?: Record<string, string>; mutationResults?: unknown[] };
function scopedCampaigns(resources: unknown, customerId: string): string[] {
  const campaigns = (resources as Resources | null)?.campaigns;
  if (!Array.isArray(campaigns) || !campaigns.length || campaigns.some(name => !new RegExp(`^customers/${customerId}/campaigns/\\d+$`).test(name))) throw new Error("PLAN_RESOURCES_UNAVAILABLE");
  return campaigns;
}
async function ownedCampaigns(client: GoogleSearchClient, planId: string, names?: string[], tolerateMissing = false) {
  const condition = names ? `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})` : `campaign.name LIKE 'Minber ${planId} | %'`;
  const rows = await client.query(`SELECT campaign.resource_name, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE ${condition} AND campaign.status != 'REMOVED'`);
  if (rows.some(row => (names ? !names.includes(row.campaign.resourceName) : !String(row.campaign?.name || "").startsWith(`Minber ${planId} | `)) || row.campaignBudget?.explicitlyShared)) throw new Error("RESOURCE_OWNERSHIP_CHANGED");
  if (names && !tolerateMissing && rows.length !== names.length) throw new Error("RESOURCE_OWNERSHIP_CHANGED");
  return rows;
}

/** Live approval preview, with no writes or provider mutations. */
export async function inspectSearchPlanProvider(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("INVALID_PLAN_ID");
  const plan = await prisma.googleSearchPlan.findUnique({where:{id}});
  if(!plan)throw new Error("PLAN_NOT_FOUND");
  const connection=await prisma.marketingPlatformConnection.findFirst({where:{id:plan.connectionId,platform:"GOOGLE_ADS"}});
  if(!connection)throw new Error("ACCOUNT_NOT_AVAILABLE");
  const client=await googleSearchClient(searchCredentials(connection));
  const recorded=(plan.resources as Resources|null)?.campaigns;
  const names=recorded?.length?scopedCampaigns(plan.resources,client.id):undefined;
  const rows=await ownedCampaigns(client,plan.id,names,true);
  const account=(await client.query("SELECT customer.currency_code FROM customer LIMIT 1"))[0]?.customer;
  if(!account?.currencyCode)throw new Error("ACCOUNT_CURRENCY_UNAVAILABLE");
  if(rows.some(row=>!Number.isSafeInteger(Number(row.campaignBudget.amountMicros))||Number(row.campaignBudget.amountMicros)<=0))throw new Error("PROVIDER_BUDGET_UNAVAILABLE");
  return {readOnly:true,currency:account.currencyCode,providerDailyBudget:rows.reduce((sum,row)=>sum+Number(row.campaignBudget.amountMicros),0)/1e6,
    missingResources:names?.filter(name=>!rows.some(row=>row.campaign.resourceName===name))||[],
    campaigns:rows.map(row=>({resource:row.campaign.resourceName,name:row.campaign.name,status:row.campaign.status,dailyBudget:Number(row.campaignBudget.amountMicros)/1e6})),providerMutations:0};
}

export async function executeSearchPlan(input: ActionInput) {
  if (!/^[a-f0-9]{24}$/i.test(input.id)) throw new Error("INVALID_PLAN_ID");
  if (input.action === "pause") return emergencyPauseSearchPlan(input.id);
  const plan = await prisma.googleSearchPlan.findUnique({ where: { id: input.id } });
  if (!plan || plan.version !== input.version) throw new Error("PLAN_CHANGED_RELOAD");
  if (input.action === "automation" && input.policy?.enabled === false) {
    const changed = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: plan.version }, data: { automationEnabled: false, version: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("PLAN_CHANGED_RELOAD");
    return prisma.googleSearchPlan.findUniqueOrThrow({ where: { id: plan.id } });
  }
  if (input.action === "archive") {
    if (!["DRAFT", "VALIDATED", "PLANNING_FAILED"].includes(plan.status) || (plan.resources as Resources | null)?.campaigns?.length || input.confirmation !== "ARCHIVE_PLAN") throw new Error("PLAN_CANNOT_BE_ARCHIVED");
    return withPlanLease(plan, async token => {
      const changed = await prisma.googleSearchPlan.updateMany({where:{id:plan.id,version:plan.version,status:plan.status,workLeaseToken:token},data:{status:"ARCHIVED",automationEnabled:false,version:{increment:1}}});
      if(changed.count!==1)throw new Error("PLAN_CHANGED_RELOAD");
      return prisma.googleSearchPlan.findUniqueOrThrow({where:{id:plan.id}});
    });
  }
  if(input.action === "detach") {
    if(input.confirmation!=="DETACH_PLAN" || !["RECONCILE_REQUIRED","PARTIAL_PROVIDER_STATE"].includes(plan.status))throw new Error("DETACH_CONFIRMATION_REQUIRED");
    const stopped = await emergencyPauseSearchPlan(plan.id);
    if(stopped.status!=="PAUSED")throw new Error("EMERGENCY_PAUSE_UNCONFIRMED");
    const changed=await prisma.googleSearchPlan.updateMany({where:{id:plan.id,version:stopped.version,status:"PAUSED"},data:{status:"DETACHED",automationEnabled:false,lastError:null,version:{increment:1}}});
    if(changed.count!==1)throw new Error("PLAN_CHANGED_RELOAD");
    return prisma.googleSearchPlan.findUniqueOrThrow({where:{id:plan.id}});
  }
  return withPlanLease(plan, async token => {
  let ownedVersion = plan.version, ownedStatus = plan.status;
  const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS", enabled: true } });
  if (!connection) throw new Error("ACCOUNT_NOT_AVAILABLE");
  const client = await googleSearchClient(searchCredentials(connection));
  const request = searchPlanRequest.parse(plan.request), proposal = searchProposal.parse(plan.proposal);
  const account = (await client.query("SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1"))[0]?.customer;
  if (!account?.currencyCode) throw new Error("ACCOUNT_CURRENCY_UNAVAILABLE");
  const save = async (data: Prisma.GoogleSearchPlanUpdateManyMutationInput, requiredStatus = ownedStatus) => {
    const changed = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: ownedVersion, status: requiredStatus, workLeaseToken: token, workLeaseUntil: { gt: new Date() } }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("PLAN_CHANGED_RELOAD");
    const updated = await prisma.googleSearchPlan.findUniqueOrThrow({ where: { id: plan.id } });
    ownedVersion = updated.version; ownedStatus = updated.status;
    return updated;
  };

  const stillCurrent = async () => {
    const current = await prisma.googleSearchPlan.findFirst({ where: { id: plan.id, version: ownedVersion, status: ownedStatus, workLeaseToken: token, workLeaseUntil: { gt: new Date() } } });
    if (!current) throw new Error("PLAN_CHANGED_RELOAD");
  };
  if (input.action === "reconcile") {
    if (!["RECONCILE_REQUIRED", "CREATING", "CHANGING", "PARTIAL_PROVIDER_STATE"].includes(plan.status)) throw new Error("RECONCILIATION_NOT_REQUIRED");
    if (["CREATING", "CHANGING"].includes(plan.status) && Date.now() - plan.updatedAt.getTime() < 5 * 60 * 1000) throw new Error("PROVIDER_OPERATION_IN_PROGRESS");
    const recorded = (plan.resources as Resources | null)?.campaigns;
    const rows = await ownedCampaigns(client, plan.id, recorded?.length ? scopedCampaigns(plan.resources, client.id) : undefined, true);
    const recoveryEvidence=(plan.evidence||{}) as Record<string,unknown>;
    if(Array.isArray(recoveryEvidence.partialCleanupPending)) {
      if(!rows.length)return save({status:"VALIDATED",resources:jsonValue(null),automationEnabled:false,lastError:null,evidence:jsonValue({...recoveryEvidence,partialCleanupPending:null,partialCleanup:{at:new Date().toISOString(),removed:recoveryEvidence.partialCleanupPending}})});
      return save({status:"PARTIAL_PROVIDER_STATE",automationEnabled:false,lastError:"PARTIAL_CLEANUP_UNCONFIRMED"});
    }
    if (!rows.length && !recorded?.length) return save({ status: "VALIDATED", resources: jsonValue(null), lastError: null, automationEnabled: false });
    if (rows.length < proposal.campaigns.length) return save({ status: "PARTIAL_PROVIDER_STATE", resources: jsonValue({ ...((plan.resources || {}) as Record<string,unknown>), campaigns: recorded?.length ? recorded : rows.map(row => row.campaign.resourceName), presentCampaigns: rows.map(row => row.campaign.resourceName) }), lastError: recorded?.length ? "PROVIDER_RESOURCE_MISSING" : "PARTIAL_PROVIDER_STATE", automationEnabled: false });
    if (rows.length !== proposal.campaigns.length) throw new Error("MANUAL_PROVIDER_RECONCILIATION_REQUIRED");
    if (rows.some(row => Number(row.campaignBudget?.amountMicros) <= 0)) throw new Error("PROVIDER_BUDGET_UNAVAILABLE");
    const evidence = (plan.evidence || {}) as Record<string, unknown>;
    if (evidence.optimizationPending) {
      const {cycle,...pendingChanges}=evidence.optimizationPending as Record<string,unknown>;
      await verifySearchImprovements(client, rows.map(row => row.campaign.resourceName), pendingChanges);
      const pendingOptimization = {cycle} as {cycle?: Record<string,unknown>};
      if(pendingOptimization.cycle)evidence.optimization=appendOptimizationHistory(evidence,pendingOptimization.cycle);
    }
    if(Array.isArray(evidence.keywordRestorePending) && evidence.keywordRestorePending.length) {
      const pendingRestore=evidence.keywordRestorePending as string[];
      if(pendingRestore.some(name=>!new RegExp(`^customers/${client.id}/adGroupCriteria/\\d+~\\d+$`).test(name)))throw new Error("INVALID_RESOURCE_SCOPE");
      const restored=await client.query(`SELECT campaign.resource_name, ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.resource_name IN (${rows.map(row=>`'${row.campaign.resourceName}'`).join(',')}) AND ad_group_criterion.resource_name IN (${pendingRestore.map(name=>`'${name}'`).join(',')})`);
      if(restored.length!==pendingRestore.length || new Set(restored.map(row=>row.adGroupCriterion.resourceName)).size!==pendingRestore.length || restored.some(row=>!pendingRestore.includes(row.adGroupCriterion.resourceName)||row.adGroupCriterion.status!=="ENABLED"))throw new Error("KEYWORD_RESTORE_UNCONFIRMED");
      evidence.optimization=appendOptimizationHistory(evidence,{runId:"restore:"+pendingRestore.join(','),at:new Date().toISOString(),kind:"RESTORE",restoredKeywords:pendingRestore.map(resource=>({resource})),pausedKeywords:[]});
      evidence.keywordRestorePending=null;
    }
    const pending = evidence.pendingChange as { request?: unknown; proposal?: unknown } | null;
    const matches = (expected: typeof proposal) => rows.every(row => Number(row.campaignBudget.amountMicros) === proposalCampaignForResource(expected, plan.resources, row.campaign.resourceName, row.campaign.name)?.dailyBudgetMicros);
    const proposed = pending?.proposal ? searchProposal.parse(pending.proposal) : proposal;
    const pendingApplied = matches(proposed);
    if (!pendingApplied && !matches(proposal)) throw new Error("PROVIDER_BUDGET_CHANGED_REVIEW_REQUIRED");
    const status = rows.every(row => row.campaign.status === "PAUSED") ? "PAUSED" : rows.every(row => row.campaign.status === "ENABLED") ? "ACTIVE" : "MIXED";
    return save({ status, resources: jsonValue({ campaigns: rows.map(row => row.campaign.resourceName), campaignKeys:Object.fromEntries(rows.map(row=>[row.campaign.resourceName,searchCampaignKey(proposalCampaignForResource(proposal,plan.resources,row.campaign.resourceName,row.campaign.name)!)])) }), lastError: null, automationEnabled: false, ...(pendingApplied && pending?.request ? { request: jsonValue(searchPlanRequest.parse(pending.request)), proposal: jsonValue(proposed) } : {}), evidence: jsonValue({ ...evidence, pendingChange: null, optimizationPending: null }) });
  }

  if (["adopt-provider-budget","discard-partial","adopt-existing"].includes(input.action)) {
    const recorded=(plan.resources as Resources|null)?.campaigns;
    const rows=await ownedCampaigns(client,plan.id,recorded?.length?scopedCampaigns(plan.resources,client.id):undefined,true);
    if(!rows.length) {
      if(input.action==="discard-partial" && plan.status==="PARTIAL_PROVIDER_STATE" && input.confirmation==="REMOVE_PARTIAL_CAMPAIGNS")return save({status:"VALIDATED",resources:jsonValue(null),automationEnabled:false,lastError:null});
      throw new Error("PLAN_RESOURCES_UNAVAILABLE");
    }
    const evidence=(plan.evidence||{}) as Record<string,unknown>;
    if(input.action==="discard-partial") {
      if(plan.status!=="PARTIAL_PROVIDER_STATE" || input.confirmation!=="REMOVE_PARTIAL_CAMPAIGNS")throw new Error("PARTIAL_CLEANUP_APPROVAL_REQUIRED");
      const names=rows.map(row=>row.campaign.resourceName);
      const operations=names.map(resourceName=>({campaignOperation:{update:{resourceName,status:"PAUSED"},updateMask:"status"}}) as Record<string,unknown>);
      operations.push(...names.map(remove=>({campaignOperation:{remove}})));
      await client.call("googleAds:mutate",{mutateOperations:operations,partialFailure:false,validateOnly:true});
      await save({status:"CHANGING",automationEnabled:false,evidence:jsonValue({...evidence,partialCleanupPending:names})});
      try {
        await stillCurrent();await client.call("googleAds:mutate",{mutateOperations:operations,partialFailure:false,validateOnly:false});
        const remaining=await ownedCampaigns(client,plan.id,names,true);
        if(remaining.length)throw new SearchApiError("PARTIAL_CLEANUP_UNCONFIRMED",502,true);
        return await save({status:"VALIDATED",resources:jsonValue(null),lastError:null,evidence:jsonValue({...evidence,partialCleanupPending:null,partialCleanup:{at:new Date().toISOString(),removed:names}})},"CHANGING");
      }catch(error){await save({status:"RECONCILE_REQUIRED",automationEnabled:false,lastError:"PARTIAL_CLEANUP_UNCONFIRMED"},"CHANGING").catch(()=>{});throw error;}
    }
    const partial=input.action==="adopt-existing";
    if(input.confirmation!==(partial?"ADOPT_EXISTING_CAMPAIGNS":"ADOPT_PROVIDER_BUDGET") || input.currency!==account.currencyCode)throw new Error("PROVIDER_BUDGET_APPROVAL_REQUIRED");
    if(partial&&plan.status!=="PARTIAL_PROVIDER_STATE" || !partial&&rows.length!==proposal.campaigns.length)throw new Error("PROVIDER_RESOURCE_MISSING");
    const campaigns=rows.map(row=>{
      const selected=proposalCampaignForResource(proposal,plan.resources,row.campaign.resourceName,row.campaign.name);
      const budget=Number(row.campaignBudget.amountMicros);
      if(!selected||!Number.isSafeInteger(budget)||budget<=0)throw new Error("PROVIDER_BUDGET_UNAVAILABLE");
      return {...selected,dailyBudgetMicros:budget};
    });
    if(new Set(campaigns.map(searchCampaignKey)).size!==campaigns.length)throw new Error("RESOURCE_OWNERSHIP_CHANGED");
    const actual=campaigns.reduce((sum,c)=>sum+c.dailyBudgetMicros,0);
    if(!Number.isSafeInteger(actual)||!Number.isFinite(input.newDailyBudget)||Math.round(input.newDailyBudget!*1e6)!==actual)throw new Error("PROVIDER_BUDGET_CHANGED_RELOAD");
    const locales=[...new Set(campaigns.map(c=>c.locale))];
    const localeWeights=Object.fromEntries(locales.map(locale=>[locale,100*campaigns.filter(c=>c.locale===locale).reduce((sum,c)=>sum+c.dailyBudgetMicros,0)/actual]));
    const nextRequest={...request,dailyBudget:actual/1e6,locales,localeWeights,...(partial?{campaignTargets:campaigns.map(c=>({locale:c.locale,...(c.country?{country:c.country}:{})}))}:{})};
    const nextProposal={...proposal,campaigns};
    const status=rows.every(r=>r.campaign.status==="PAUSED")?"PAUSED":rows.every(r=>r.campaign.status==="ENABLED")?"ACTIVE":"MIXED";
    return save({status,request:jsonValue(searchPlanRequest.parse(nextRequest)),proposal:jsonValue(nextProposal),resources:jsonValue({campaigns:rows.map(row=>row.campaign.resourceName),campaignKeys:Object.fromEntries(rows.map((row,i)=>[row.campaign.resourceName,searchCampaignKey(campaigns[i])]))}),automationEnabled:false,lastError:null,evidence:jsonValue({...evidence,providerAdoption:{at:new Date().toISOString(),action:input.action,dailyBudgetMicros:actual},pendingChange:null})});
  }
  if (input.action === "restore-keywords") {
    if(input.confirmation!=="RESTORE_AUTOMATION_KEYWORDS")throw new Error("KEYWORD_RESTORE_APPROVAL_REQUIRED");
    const names=scopedCampaigns(plan.resources,client.id);
    await ownedCampaigns(client,plan.id,names);
    const evidence=(plan.evidence||{}) as Record<string,unknown>, pending=new Set<string>();
    for(const cycle of optimizationHistory(evidence)) {
      for(const item of Array.isArray(cycle.pausedKeywords)?cycle.pausedKeywords:[])if(typeof item?.resource==="string")pending.add(item.resource);
      for(const item of Array.isArray(cycle.restoredKeywords)?cycle.restoredKeywords:[])if(typeof item?.resource==="string")pending.delete(item.resource);
    }
    if([...pending].some(name=>!new RegExp(`^customers/${client.id}/adGroupCriteria/\\d+~\\d+$`).test(name)))throw new Error("INVALID_RESOURCE_SCOPE");
    if(!pending.size)return prisma.googleSearchPlan.findUniqueOrThrow({where:{id:plan.id}});
    const scope=`campaign.resource_name IN (${names.map(name=>`'${name}'`).join(',')})`;
    const rows=await client.query(`SELECT campaign.resource_name, ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE ${scope} AND ad_group_criterion.resource_name IN (${[...pending].map(name=>`'${name}'`).join(',')})`);
    if(rows.some(row=>!names.includes(row.campaign.resourceName)||!pending.has(row.adGroupCriterion.resourceName)))throw new Error("INVALID_RESOURCE_SCOPE");
    const restore=rows.filter(row=>row.adGroupCriterion.status==="PAUSED").map(row=>row.adGroupCriterion.resourceName);
    const operations=restore.map(resourceName=>({adGroupCriterionOperation:{update:{resourceName,status:"ENABLED"},updateMask:"status"}}));
    if(operations.length) {
      await client.call("googleAds:mutate",{mutateOperations:operations,partialFailure:false,validateOnly:true});
      await save({status:"CHANGING",evidence:jsonValue({...evidence,keywordRestorePending:restore})});
      try {
        await stillCurrent();await client.call("googleAds:mutate",{mutateOperations:operations,partialFailure:false,validateOnly:false});
        const verified=await client.query(`SELECT ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE ad_group_criterion.resource_name IN (${restore.map(name=>`'${name}'`).join(',')})`);
        if(verified.length!==restore.length||verified.some(row=>!restore.includes(row.adGroupCriterion.resourceName)||row.adGroupCriterion.status!=="ENABLED"))throw new SearchApiError("KEYWORD_RESTORE_UNCONFIRMED",502,true);
      }catch(error){await save({status:"RECONCILE_REQUIRED",automationEnabled:false,lastError:"KEYWORD_RESTORE_UNCONFIRMED"},"CHANGING").catch(()=>{});throw error;}
    }
    return save({status:plan.status,evidence:jsonValue({...evidence,keywordRestorePending:null,optimization:appendOptimizationHistory(evidence,{runId:token,at:new Date().toISOString(),kind:"RESTORE",restoredKeywords:[...pending].filter(name=>rows.some(row=>row.adGroupCriterion.resourceName===name&&["ENABLED","PAUSED"].includes(row.adGroupCriterion.status))).map(resource=>({resource})),pausedKeywords:[]})}),lastError:null},operations.length?"CHANGING":plan.status);
  }
  if (input.action === "validate" || input.action === "create") {
    if (!["DRAFT", "VALIDATED"].includes(plan.status)) throw new Error("PLAN_NOT_CREATABLE");
    const destinations: SearchDestination[] = await searchDestinations(request);
    const targeting = await searchTargeting(client, request);
    const operations = buildSearchOperations({ customerId: client.id, planId: plan.id, request, proposal, destinations, ...targeting });
    await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: true });
    if (input.action === "validate") return save({ status: "VALIDATED", lastError: null });
    if (plan.status !== "VALIDATED" || input.confirmation !== "CREATE_PAUSED" || input.dailyBudget !== request.dailyBudget || input.currency !== account.currencyCode) throw new Error("EXPLICIT_BUDGET_APPROVAL_REQUIRED");
    await save({ status: "CREATING", lastError: null });
    let createdResources:Resources|null=null;
    try {
      await stillCurrent();
      const response = await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
      const campaigns = (response.mutateOperationResponses || []).flatMap((row: { campaignResult?: { resourceName?: string } }) => row.campaignResult?.resourceName ? [row.campaignResult.resourceName] : []);
      scopedCampaigns({ campaigns }, client.id);
      createdResources={campaigns,campaignKeys:Object.fromEntries(campaigns.map((name,i)=>[name,searchCampaignKey(proposal.campaigns[i])])),mutationResults:response.mutateOperationResponses};
      if (campaigns.length !== proposal.campaigns.length) throw new SearchApiError("GOOGLE_ADS_RESPONSE_INCOMPLETE", 502, true);
      const verified = await ownedCampaigns(client, plan.id, campaigns);
      if (verified.some(row => row.campaign.status !== "PAUSED")) throw new SearchApiError("CAMPAIGN_STATE_REQUIRES_REVIEW", 502, true);
      return await save({ status: "PAUSED", resources: jsonValue({ campaigns, campaignKeys: Object.fromEntries(campaigns.map((name, i) => [name, searchCampaignKey(proposal.campaigns[i])])), mutationResults: response.mutateOperationResponses }) }, "CREATING");
    } catch (error) {
      if(createdResources){
        const latest=await prisma.googleSearchPlan.findFirst({where:{id:plan.id,workLeaseToken:token}});
        if(latest && latest.version!==ownedVersion){
          await prisma.googleSearchPlan.updateMany({where:{id:plan.id,version:latest.version,workLeaseToken:token},data:{resources:jsonValue(createdResources),automationEnabled:false,evidence:jsonValue({...((latest.evidence||{}) as Record<string,unknown>),emergencyPausePending:true}),version:{increment:1}}});
        }
      }
      await save({ status: error instanceof SearchApiError && !error.uncertain ? "VALIDATED" : "RECONCILE_REQUIRED", lastError: error instanceof SearchApiError ? error.code : "PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", automationEnabled: false }, "CREATING").catch(() => {});
      throw error;
    }
  }

  if (!["PAUSED", "ACTIVE", "MIXED"].includes(plan.status)) throw new Error("PLAN_NOT_DEPLOYED");
  const names = scopedCampaigns(plan.resources, client.id), rows = await ownedCampaigns(client, plan.id, names);
  const plannedTotal = proposal.campaigns.reduce((sum, campaign) => sum + campaign.dailyBudgetMicros, 0);
  if (rows.reduce((sum, row) => sum + Number(row.campaignBudget.amountMicros), 0) !== plannedTotal) throw new Error("PROVIDER_BUDGET_CHANGED_REVIEW_REQUIRED");
  if (input.action === "automation") {
    const parsedPolicy = searchAutomationPolicy.safeParse(input.policy);
    if (!parsedPolicy.success) throw new Error("AUTOMATION_LIMITS_REQUIRED");
    const policy = parsedPolicy.data;
    if (policy.enabled) await requireConversionTracking(client);
    if (policy.enabled && input.confirmation !== "ENABLE_BOUNDED_OPTIMIZATION") throw new Error("OPTIMIZATION_APPROVAL_REQUIRED");
    return save({ automationEnabled: policy.enabled, automationPolicy: jsonValue(policy), lastReviewAt: null });
  }
  if ((input.dailyBudget !== request.dailyBudget || input.currency !== account.currencyCode)) throw new Error("EXPLICIT_BUDGET_APPROVAL_REQUIRED");
  let operations: Record<string, unknown>[];
  let updatedProposal = proposal;
  if (input.action === "budget") {
    const next = { newDailyBudget: input.newDailyBudget };
    if (input.confirmation !== "CHANGE_BUDGET" || !Number.isFinite(next?.newDailyBudget) || next.newDailyBudget! <= 0 || next.newDailyBudget! > 1e6) throw new Error("BUDGET_APPROVAL_REQUIRED");
    const newTotal = Math.round(next.newDailyBudget! * 1e6); let assigned = 0;
    updatedProposal = { ...proposal, campaigns: proposal.campaigns.map((campaign, index) => {
      const amount = index === proposal.campaigns.length - 1 ? newTotal - assigned : Math.floor(newTotal * campaign.dailyBudgetMicros / plannedTotal); assigned += amount;
      return { ...campaign, dailyBudgetMicros: amount };
    }) };
    if (updatedProposal.campaigns.some(c => c.dailyBudgetMicros < (proposal.minCampaignDailyBudgetMicros || 1))) throw new Error("BUDGET_TOO_SMALL");
    operations = rows.map(row => {
      const campaign = proposalCampaignForResource(updatedProposal, plan.resources, row.campaign.resourceName, row.campaign.name);
      if (!campaign) throw new Error("PROVIDER_CAMPAIGN_CHANGED");
      return { campaignBudgetOperation: { update: { resourceName: row.campaign.campaignBudget, amountMicros: String(campaign.dailyBudgetMicros) }, updateMask: "amount_micros" } };
    });
  } else {
    if (input.action === "enable" && input.confirmation !== "ENABLE_CAMPAIGNS") throw new Error("ACTIVATION_APPROVAL_REQUIRED");
    operations = names.map(resourceName => ({ campaignOperation: { update: { resourceName, status: "ENABLED" }, updateMask: "status" } }));
  }
  await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: true });
  const evidence = (plan.evidence || {}) as Record<string, unknown>;
  await save({ status: "CHANGING", evidence: jsonValue({ ...evidence, pendingChange: { action: input.action, request: input.action === "budget" ? { ...request, dailyBudget: input.newDailyBudget } : request, proposal: updatedProposal } }) });
  try {
    await stillCurrent();
    await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
    const fresh = await ownedCampaigns(client, plan.id, names);
    if (input.action === "budget" ? fresh.some(row => Number(row.campaignBudget.amountMicros) !== proposalCampaignForResource(updatedProposal, plan.resources, row.campaign.resourceName, row.campaign.name)?.dailyBudgetMicros) : fresh.some(row => row.campaign.status !== ("ENABLED"))) throw new SearchApiError("PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", 502, true);
    const status = fresh.every(row => row.campaign.status === "PAUSED") ? "PAUSED" : fresh.every(row => row.campaign.status === "ENABLED") ? "ACTIVE" : "MIXED";
    return await save({ status, lastError: null, proposal: jsonValue(updatedProposal), evidence: jsonValue({ ...evidence, pendingChange: null }), ...(input.action === "budget" ? { request: jsonValue({ ...request, dailyBudget: input.newDailyBudget }) } : {}) }, "CHANGING");
  } catch (error) {
    await save({ status: "RECONCILE_REQUIRED", lastError: error instanceof SearchApiError ? error.code : "PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", automationEnabled: false }, "CHANGING").catch(() => {});
    throw error;
  }
  });
}
