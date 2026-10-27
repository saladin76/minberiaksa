import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { SearchApiError, googleSearchClient, searchCredentials, type GoogleSearchClient } from "./client";
import { buildSearchOperations, searchPlanRequest, searchProposal, type SearchDestination } from "./contracts";
import { searchDestinations, searchTargeting } from "./planner";

export const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type ActionInput = { id: string; version: number; action: "validate" | "create" | "enable" | "pause" | "budget" | "automation" | "reconcile"; confirmation?: string; dailyBudget?: number; newDailyBudget?: number; currency?: string; policy?: { enabled: boolean; maxKeywordCost: number; minClicks: number } };
type Resources = { campaigns: string[]; mutationResults?: unknown[] };
function scopedCampaigns(resources: unknown, customerId: string): string[] {
  const campaigns = (resources as Resources | null)?.campaigns;
  if (!Array.isArray(campaigns) || !campaigns.length || campaigns.some(name => !new RegExp(`^customers/${customerId}/campaigns/\\d+$`).test(name))) throw new Error("PLAN_RESOURCES_UNAVAILABLE");
  return campaigns;
}
async function ownedCampaigns(client: GoogleSearchClient, planId: string, names?: string[]) {
  const condition = names ? `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})` : `campaign.name LIKE 'Minber ${planId} | %'`;
  const rows = await client.query(`SELECT campaign.resource_name, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE ${condition} AND campaign.status != 'REMOVED'`);
  if (rows.some(row => !String(row.campaign?.name || "").startsWith(`Minber ${planId} | `) || row.campaignBudget?.explicitlyShared)) throw new Error("RESOURCE_OWNERSHIP_CHANGED");
  if (names && rows.length !== names.length) throw new Error("RESOURCE_OWNERSHIP_CHANGED");
  return rows;
}

export async function executeSearchPlan(input: ActionInput) {
  if (!/^[a-f0-9]{24}$/i.test(input.id)) throw new Error("INVALID_PLAN_ID");
  const plan = await prisma.googleSearchPlan.findUnique({ where: { id: input.id } });
  if (!plan || plan.version !== input.version) throw new Error("PLAN_CHANGED_RELOAD");
  const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS", enabled: true } });
  if (!connection) throw new Error("ACCOUNT_NOT_AVAILABLE");
  if (plan.workLeaseUntil && plan.workLeaseUntil.getTime() > Date.now()) throw new Error("PROVIDER_OPERATION_IN_PROGRESS");
  const client = await googleSearchClient(searchCredentials(connection));
  const request = searchPlanRequest.parse(plan.request), proposal = searchProposal.parse(plan.proposal);
  const account = (await client.query("SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1"))[0]?.customer;
  if (!account?.currencyCode) throw new Error("ACCOUNT_CURRENCY_UNAVAILABLE");
  const save = async (data: Prisma.GoogleSearchPlanUpdateManyMutationInput, requiredStatus = plan.status) => {
    const changed = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: input.version, status: requiredStatus }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("PLAN_CHANGED_RELOAD");
    return prisma.googleSearchPlan.findUniqueOrThrow({ where: { id: plan.id } });
  };

  if (input.action === "reconcile") {
    if (!["RECONCILE_REQUIRED", "CREATING", "CHANGING"].includes(plan.status)) throw new Error("RECONCILIATION_NOT_REQUIRED");
    if (["CREATING", "CHANGING"].includes(plan.status) && Date.now() - plan.updatedAt.getTime() < 5 * 60 * 1000) throw new Error("PROVIDER_OPERATION_IN_PROGRESS");
    const rows = await ownedCampaigns(client, plan.id);
    if (rows.length !== proposal.campaigns.length) throw new Error("MANUAL_PROVIDER_RECONCILIATION_REQUIRED");
    if (rows.some(row => Number(row.campaignBudget?.amountMicros) <= 0)) throw new Error("PROVIDER_BUDGET_UNAVAILABLE");
    const evidence = (plan.evidence || {}) as Record<string, unknown>;
    const pending = evidence.pendingChange as { request?: unknown; proposal?: unknown } | null;
    const matches = (expected: typeof proposal) => rows.every(row => Number(row.campaignBudget.amountMicros) === expected.campaigns.find(c => c.locale === String(row.campaign.name).split(" | ")[1])?.dailyBudgetMicros);
    const proposed = pending?.proposal ? searchProposal.parse(pending.proposal) : proposal;
    const pendingApplied = matches(proposed);
    if (!pendingApplied && !matches(proposal)) throw new Error("PROVIDER_BUDGET_CHANGED_REVIEW_REQUIRED");
    const status = rows.every(row => row.campaign.status === "PAUSED") ? "PAUSED" : rows.every(row => row.campaign.status === "ENABLED") ? "ACTIVE" : "MIXED";
    return save({ status, resources: { campaigns: rows.map(row => row.campaign.resourceName) }, lastError: null, automationEnabled: false, ...(pendingApplied && pending?.request ? { request: jsonValue(searchPlanRequest.parse(pending.request)), proposal: jsonValue(proposed) } : {}), evidence: jsonValue({ ...evidence, pendingChange: null }) });
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
    try {
      const response = await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
      const campaigns = (response.mutateOperationResponses || []).flatMap((row: { campaignResult?: { resourceName?: string } }) => row.campaignResult?.resourceName ? [row.campaignResult.resourceName] : []);
      scopedCampaigns({ campaigns }, client.id);
      if (campaigns.length !== proposal.campaigns.length) throw new SearchApiError("GOOGLE_ADS_RESPONSE_INCOMPLETE", 502, true);
      const verified = await ownedCampaigns(client, plan.id, campaigns);
      if (verified.some(row => row.campaign.status !== "PAUSED")) throw new SearchApiError("CAMPAIGN_STATE_REQUIRES_REVIEW", 502, true);
      return await prisma.googleSearchPlan.update({ where: { id: plan.id }, data: { status: "PAUSED", resources: jsonValue({ campaigns, mutationResults: response.mutateOperationResponses }), version: { increment: 1 } } });
    } catch (error) {
      await prisma.googleSearchPlan.update({ where: { id: plan.id }, data: { status: error instanceof SearchApiError && !error.uncertain ? "VALIDATED" : "RECONCILE_REQUIRED", lastError: error instanceof SearchApiError ? error.code : "PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", automationEnabled: false, version: { increment: 1 } } });
      throw error;
    }
  }

  if (!["PAUSED", "ACTIVE", "MIXED"].includes(plan.status)) throw new Error("PLAN_NOT_DEPLOYED");
  const names = scopedCampaigns(plan.resources, client.id), rows = await ownedCampaigns(client, plan.id, names);
  const plannedTotal = proposal.campaigns.reduce((sum, campaign) => sum + campaign.dailyBudgetMicros, 0);
  if (input.action !== "pause" && rows.reduce((sum, row) => sum + Number(row.campaignBudget.amountMicros), 0) !== plannedTotal) throw new Error("PROVIDER_BUDGET_CHANGED_REVIEW_REQUIRED");
  if (input.action === "automation") {
    const policy = input.policy;
    if (!policy || !Number.isFinite(policy.maxKeywordCost) || policy.maxKeywordCost <= 0 || !Number.isInteger(policy.minClicks) || policy.minClicks < 10 || policy.minClicks > 10000) throw new Error("AUTOMATION_LIMITS_REQUIRED");
    if (policy.enabled && input.confirmation !== "ENABLE_BOUNDED_OPTIMIZATION") throw new Error("OPTIMIZATION_APPROVAL_REQUIRED");
    return save({ automationEnabled: policy.enabled, automationPolicy: jsonValue(policy), lastReviewAt: null });
  }
  if (input.action !== "pause" && (input.dailyBudget !== request.dailyBudget || input.currency !== account.currencyCode)) throw new Error("EXPLICIT_BUDGET_APPROVAL_REQUIRED");
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
    if (updatedProposal.campaigns.some(c => c.dailyBudgetMicros <= 0)) throw new Error("BUDGET_TOO_SMALL");
    operations = rows.map(row => {
      const locale = String(row.campaign.name).split(" | ")[1], campaign = updatedProposal.campaigns.find(c => c.locale === locale);
      if (!campaign) throw new Error("PROVIDER_CAMPAIGN_CHANGED");
      return { campaignBudgetOperation: { update: { resourceName: row.campaign.campaignBudget, amountMicros: String(campaign.dailyBudgetMicros) }, updateMask: "amount_micros" } };
    });
  } else {
    if (input.action === "enable" && input.confirmation !== "ENABLE_CAMPAIGNS") throw new Error("ACTIVATION_APPROVAL_REQUIRED");
    operations = names.map(resourceName => ({ campaignOperation: { update: { resourceName, status: input.action === "pause" ? "PAUSED" : "ENABLED" }, updateMask: "status" } }));
  }
  await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: true });
  const evidence = (plan.evidence || {}) as Record<string, unknown>;
  await save({ status: "CHANGING", evidence: jsonValue({ ...evidence, pendingChange: { action: input.action, request: input.action === "budget" ? { ...request, dailyBudget: input.newDailyBudget } : request, proposal: updatedProposal } }) });
  try {
    await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
    const fresh = await ownedCampaigns(client, plan.id, names);
    if (input.action === "budget" ? fresh.some(row => Number(row.campaignBudget.amountMicros) !== updatedProposal.campaigns.find(c => c.locale === String(row.campaign.name).split(" | ")[1])?.dailyBudgetMicros) : fresh.some(row => row.campaign.status !== (input.action === "pause" ? "PAUSED" : "ENABLED"))) throw new SearchApiError("PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", 502, true);
    const status = fresh.every(row => row.campaign.status === "PAUSED") ? "PAUSED" : fresh.every(row => row.campaign.status === "ENABLED") ? "ACTIVE" : "MIXED";
    return await prisma.googleSearchPlan.update({ where: { id: plan.id }, data: { status, lastError: null, proposal: jsonValue(updatedProposal), evidence: jsonValue({ ...evidence, pendingChange: null }), ...(input.action === "pause" ? { automationEnabled: false } : {}), ...(input.action === "budget" ? { request: jsonValue({ ...request, dailyBudget: input.newDailyBudget }) } : {}), version: { increment: 1 } } });
  } catch (error) {
    await prisma.googleSearchPlan.update({ where: { id: plan.id }, data: { status: "RECONCILE_REQUIRED", lastError: error instanceof SearchApiError ? error.code : "PROVIDER_OUTCOME_REQUIRES_RECONCILIATION", automationEnabled: false, version: { increment: 1 } } });
    throw error;
  }
}
