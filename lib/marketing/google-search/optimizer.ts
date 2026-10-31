import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { queueAuditLog } from "@/lib/audit-log";
import { googleSearchClient, searchCredentials, SearchApiError } from "./client";
import { jsonValue } from "./executor";
import { searchProposal } from "./contracts";
import { collectSearchGrowth, type SearchGrowthResult } from "./growth";

/** Opt-in only; touches plan-owned keywords. No budget increase or campaign deletion. */
export async function optimizeSearchPlan(planId: string, now = new Date()) {
  const plan = await prisma.googleSearchPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.automationEnabled || plan.status !== "ACTIVE" || (plan.lastReviewAt && now.getTime() - plan.lastReviewAt.getTime() < 6 * 3600000)) return;
  const policy = plan.automationPolicy as { maxKeywordCost?: number; minClicks?: number } | null;
  if (!policy || !Number.isFinite(policy.maxKeywordCost) || policy.maxKeywordCost! <= 0 || !Number.isInteger(policy.minClicks) || policy.minClicks! < 10) return;
  const token = randomUUID();
  const claim = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: plan.version, automationEnabled: true, status: "ACTIVE", OR: [{ workLeaseUntil: null }, { workLeaseUntil: { isSet: false } }, { workLeaseUntil: { lte: now } }] }, data: { workLeaseToken: token, workLeaseUntil: new Date(now.getTime() + 10 * 60000) } });
  if (claim.count !== 1) return;
  let mutationStarted = false;
  try {
    const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS", enabled: true } });
    if (!connection) throw new Error("ACCOUNT_NOT_AVAILABLE");
    const client = await googleSearchClient(searchCredentials(connection));
    const names = (plan.resources as { campaigns?: string[] } | null)?.campaigns;
    if (!names?.length || names.some(name => !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(name))) throw new Error("INVALID_RESOURCE_SCOPE");
    const scope = `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})`;
    const campaigns = await client.query(`SELECT campaign.resource_name, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE ${scope}`);
    const proposal = searchProposal.parse(plan.proposal);
    if (campaigns.length !== names.length || campaigns.some(row => !String(row.campaign.name).startsWith(`Minber ${plan.id} | `) || row.campaign.status !== "ENABLED" || row.campaignBudget.explicitlyShared || Number(row.campaignBudget.amountMicros) !== proposal.campaigns.find(c => c.locale === String(row.campaign.name).split(" | ")[1])?.dailyBudgetMicros)) throw new Error("PROVIDER_CAMPAIGN_CHANGED");
    const keywords = await client.query(`SELECT campaign.resource_name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.status, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${scope} AND segments.date DURING LAST_7_DAYS AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE ORDER BY metrics.cost_micros DESC LIMIT 1000`);
    let growth: SearchGrowthResult;
    try { growth = await collectSearchGrowth(client, names, now); }
    catch (error) { growth = { status: "UNAVAILABLE", at: now.toISOString(), reason: error instanceof SearchApiError ? error.code : "GROWTH_EVIDENCE_UNAVAILABLE" }; }
    const candidates = keywords.filter(row => Number(row.metrics.conversions) === 0 && Number(row.metrics.clicks) >= policy.minClicks! && Number(row.metrics.costMicros) / 1e6 >= policy.maxKeywordCost!).slice(0, 5);
    const operations = candidates.map(row => {
      if (!names.includes(row.campaign.resourceName)) throw new Error("INVALID_RESOURCE_SCOPE");
      if (!new RegExp(`^customers/${client.id}/adGroupCriteria/\\d+~\\d+$`).test(row.adGroupCriterion.resourceName)) throw new Error("INVALID_RESOURCE_SCOPE");
      return { adGroupCriterionOperation: { update: { resourceName: row.adGroupCriterion.resourceName, status: "PAUSED" }, updateMask: "status" } };
    });
    const stillApproved = await prisma.googleSearchPlan.findFirst({ where: { id: plan.id, version: plan.version, workLeaseToken: token, automationEnabled: true, status: "ACTIVE" } });
    if (!stillApproved) return;
    if (operations.length) {
      await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: true });
      mutationStarted = true;
      await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
      const verified = await client.query(`SELECT ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE ad_group_criterion.resource_name IN (${candidates.map(row => `'${row.adGroupCriterion.resourceName}'`).join(",")})`);
      if (verified.length !== candidates.length || verified.some(row => row.adGroupCriterion.status !== "PAUSED")) throw new SearchApiError("OPTIMIZATION_REQUIRES_RECONCILIATION", 502, true);
    }
    const evidence = { ...(plan.evidence as Record<string, unknown>), growth };
    await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: plan.version, workLeaseToken: token }, data: { lastReviewAt: now, lastError: null, evidence: jsonValue({ ...evidence, optimization: { at: now.toISOString(), period: "LAST_7_DAYS", reviewedKeywords: keywords.length, pausedKeywords: candidates.map(row => ({ resource: row.adGroupCriterion.resourceName, text: row.adGroupCriterion.keyword.text, clicks: Number(row.metrics.clicks), cost: Number(row.metrics.costMicros) / 1e6, googleConversions: 0 })), budgetChanged: false } }), version: { increment: 1 } } });
    queueAuditLog({ actorRole: "SYSTEM", action: "GOOGLE_SEARCH_OPTIMIZED", entityType: "GoogleSearchPlan", entityId: plan.id, messageAr: `مراجعة Google Search: فحص ${keywords.length} كلمة وإيقاف ${candidates.length} ضمن الحدود المعتمدة.`, metadata: { paused: candidates.map(row => row.adGroupCriterion.resourceName), budgetChanged: false } });
  } catch (error) {
    await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, workLeaseToken: token }, data: { lastReviewAt: now, lastError: error instanceof SearchApiError ? error.code : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OPTIMIZATION_FAILED", ...(mutationStarted ? { status: "RECONCILE_REQUIRED", automationEnabled: false } : {}), version: { increment: 1 } } });
  } finally { await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, workLeaseToken: token }, data: { workLeaseToken: null, workLeaseUntil: null } }); }
}
