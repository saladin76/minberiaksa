import { prisma } from "@/lib/prisma";
import { queueAuditLog } from "@/lib/audit-log";
import { googleSearchClient, searchCredentials, SearchApiError } from "./client";
import { jsonValue } from "./json";
import { proposalCampaignForResource } from "./scope";
import { searchProposal, searchPlanRequest, searchAutomationPolicy } from "./contracts";
import { collectSearchGrowth, type SearchGrowthResult } from "./growth";
import { collectSearchImprovements, searchImprovementOperations, verifySearchImprovements, type SearchImprovement } from "./improvements";
import { searchDestinations } from "./planner";
import { withPlanLease } from "./lease";
import { appendOptimizationHistory, optimizationWindow, requireConversionTracking, selectKeywordsToPause } from "./optimization-safety";

/** Opt-in only; conversion evidence, mature keywords and a per-group floor precede every mutation. */
export async function optimizeSearchPlan(planId: string, now = new Date()) {
  const plan = await prisma.googleSearchPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.automationEnabled || plan.status !== "ACTIVE" || (plan.lastReviewAt && now.getTime() - plan.lastReviewAt.getTime() < 6 * 3600000)) return;
  const parsedPolicy = searchAutomationPolicy.safeParse({ ...(plan.automationPolicy as object), enabled: true });
  if (!parsedPolicy.success) return;
  const policy = parsedPolicy.data;
  try { return await withPlanLease(plan, async token => {
    let mutationStarted = false;
    try {
      const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS", enabled: true } });
      if (!connection) throw new Error("ACCOUNT_NOT_AVAILABLE");
      const client = await googleSearchClient(searchCredentials(connection));
      await requireConversionTracking(client);
      const account = (await client.query("SELECT customer.time_zone FROM customer LIMIT 1"))[0]?.customer;
      if (!account?.timeZone) throw new Error("ACCOUNT_TIMEZONE_UNAVAILABLE");
      const window = optimizationWindow(now, account.timeZone);
      const names = (plan.resources as { campaigns?: string[] } | null)?.campaigns;
      if (!names?.length || names.some(name => !new RegExp(`^customers/${client.id}/campaigns/\\d+$`).test(name))) throw new Error("INVALID_RESOURCE_SCOPE");
      const scope = `campaign.resource_name IN (${names.map(name => `'${name}'`).join(",")})`;
      const campaigns = await client.query(`SELECT campaign.resource_name, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE ${scope}`);
      const proposal = searchProposal.parse(plan.proposal);
      if (campaigns.length !== names.length || campaigns.some(row => !names.includes(row.campaign.resourceName) || row.campaign.status !== "ENABLED" || row.campaignBudget.explicitlyShared || Number(row.campaignBudget.amountMicros) !== proposalCampaignForResource(proposal, plan.resources, row.campaign.resourceName, row.campaign.name)?.dailyBudgetMicros)) throw new Error("PROVIDER_CAMPAIGN_CHANGED");
      const [keywords, enabled, historical, groups] = await Promise.all([
        client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${scope} AND segments.date BETWEEN '${window.since}' AND '${window.until}' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE ORDER BY metrics.cost_micros DESC LIMIT 1001`),
        client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE ${scope} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE LIMIT 10001`),
        client.query(`SELECT campaign.resource_name, ad_group.resource_name, ad_group_criterion.resource_name, segments.date, metrics.impressions FROM keyword_view WHERE ${scope} AND segments.date BETWEEN '${window.historySince}' AND '${window.matureBefore}' AND metrics.impressions > 0 AND ad_group_criterion.negative = FALSE ORDER BY segments.date ASC LIMIT 50001`),
        client.query(`SELECT ad_group.resource_name FROM ad_group WHERE ${scope} AND ad_group.status = 'ENABLED' LIMIT 1001`),
      ]);
      if (keywords.length > 1000 || enabled.length > 10000 || historical.length > 50000 || groups.length > 1000) throw new Error("KEYWORD_REVIEW_INCOMPLETE");
      for (const row of [...keywords, ...enabled, ...historical]) if (!names.includes(row.campaign.resourceName) || !new RegExp(`^customers/${client.id}/adGroupCriteria/\\d+~\\d+$`).test(row.adGroupCriterion.resourceName) || !new RegExp(`^customers/${client.id}/adGroups/\\d+$`).test(row.adGroup?.resourceName || "")) throw new Error("INVALID_RESOURCE_SCOPE");
      const emptyGroup = groups.some(row => !enabled.some(keyword => keyword.adGroup.resourceName === row.adGroup.resourceName));
      const candidates = selectKeywordsToPause(keywords, enabled, historical, policy.minActiveKeywordsPerGroup, { minClicks: policy.minClicks!, maxKeywordCost: policy.maxKeywordCost! }, window.matureBefore);
      const paused = candidates.map(row => row.adGroupCriterion.resourceName);
      let growth: SearchGrowthResult;
      try { growth = await collectSearchGrowth(client, names, now); }
      catch (error) { growth = { status: "UNAVAILABLE", at: now.toISOString(), reason: error instanceof SearchApiError ? error.code : "GROWTH_EVIDENCE_UNAVAILABLE" }; }
      const improvements: SearchImprovement = policy.expandKeywords || policy.refreshAds
        ? await collectSearchImprovements(client, names, plan.id, proposal, await searchDestinations(searchPlanRequest.parse(plan.request)), policy, now, plan.resources)
        : { at: now.toISOString(), paused: [], keywords: [], ads: [], warnings: [] };
      improvements.paused = paused;
      if (emptyGroup) improvements.warnings.push("AD_GROUP_HAS_NO_ACTIVE_KEYWORDS");
      const operations = searchImprovementOperations(improvements);
      const evidence = { ...(plan.evidence as Record<string, unknown>), growth };
      const cycle = { runId: token, at: now.toISOString(), period: window, reviewedKeywords: keywords.length, pausedKeywords: candidates.map(row => ({ resource: row.adGroupCriterion.resourceName, text: row.adGroupCriterion.keyword.text, clicks: Number(row.metrics.clicks), cost: Number(row.metrics.costMicros) / 1e6, googleConversions: 0 })), addedKeywords: improvements.keywords, warnings: improvements.warnings, createdAds: improvements.ads.map(a => ({ adGroup: a.adGroup, headlines: a.headlines })), budgetChanged: false };
      const approvedWhere = { id: plan.id, version: plan.version, workLeaseToken: token, workLeaseUntil: { gt: new Date() }, automationEnabled: true, status: "ACTIVE" };
      if (!(await prisma.googleSearchPlan.findFirst({ where: approvedWhere }))) return;
      if (operations.length) {
        await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: true });
        // This atomic reservation rechecks the emergency stop immediately before the live mutation.
        const reserved = await prisma.googleSearchPlan.updateMany({ where: approvedWhere, data: { status: "CHANGING", evidence: jsonValue({ ...evidence, optimizationPending: { ...improvements, cycle } }) } });
        if (reserved.count !== 1) return;
        mutationStarted = true;
        await client.call("googleAds:mutate", { mutateOperations: operations, partialFailure: false, validateOnly: false });
        await verifySearchImprovements(client, names, improvements);
      }
      const finalData = { lastReviewAt: now, lastError: emptyGroup ? "AD_GROUP_HAS_NO_ACTIVE_KEYWORDS" : null, evidence: jsonValue({ ...evidence, optimizationPending: null, optimization: appendOptimizationHistory(evidence, cycle) }), version: { increment: 1 } };
      const saved = await prisma.googleSearchPlan.updateMany({ where: { ...approvedWhere, status: operations.length ? "CHANGING" : "ACTIVE" }, data: { ...finalData, status: "ACTIVE" } });
      if (saved.count !== 1) {
        // A provider mutation must never lose its history after an emergency version change.
        const latest = await prisma.googleSearchPlan.findFirst({ where: { id: plan.id, workLeaseToken: token } });
        if (!latest) throw new SearchApiError("OPTIMIZATION_REQUIRES_RECONCILIATION", 409, mutationStarted);
        const currentEvidence = (latest.evidence || {}) as Record<string, unknown>;
        const retained = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: latest.version, workLeaseToken: token }, data: { lastReviewAt: now, automationEnabled: false,
          ...(!["PAUSING", "PAUSED", "DETACHED"].includes(latest.status) ? { status: "RECONCILE_REQUIRED", lastError: "OPTIMIZATION_REQUIRES_RECONCILIATION" } : {}),
          evidence: jsonValue({ ...currentEvidence, optimizationPending: null, optimization: appendOptimizationHistory(currentEvidence, cycle) }), version: { increment: 1 } } });
        if (retained.count !== 1) throw new SearchApiError("OPTIMIZATION_REQUIRES_RECONCILIATION", 409, true);
      }
      queueAuditLog({ actorRole: "SYSTEM", action: "GOOGLE_SEARCH_OPTIMIZED", entityType: "GoogleSearchPlan", entityId: plan.id, messageAr: `مراجعة Google Search: إيقاف ${paused.length} كلمة مع إبقاء الحد الأدنى لكل مجموعة دون تغيير الميزانية.`, metadata: { paused, window, minActiveKeywordsPerGroup: policy.minActiveKeywordsPerGroup, budgetChanged: false } });
    } catch (error) {
      const code = error instanceof SearchApiError ? error.code : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OPTIMIZATION_FAILED";
      await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: plan.version, workLeaseToken: token, status: { in: ["ACTIVE", "CHANGING"] } }, data: { lastReviewAt: now, lastError: code, ...(mutationStarted ? { status: "RECONCILE_REQUIRED", automationEnabled: false } : code === "CONVERSION_TRACKING_REQUIRED" ? { automationEnabled: false } : {}), version: { increment: 1 } } });
    }
  }); } catch (error) { if ((error as {message?: unknown} | null)?.message !== "PROVIDER_OPERATION_IN_PROGRESS") throw error; }
}
