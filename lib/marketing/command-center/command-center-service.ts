import { getRecommendationOverview } from "@/lib/ai/recommendations/recommendation-service";
import { getMarketingResultsOverview } from "@/lib/marketing/results/results-service";
import type { ProviderHealthOverview } from "@/lib/marketing/integrations/provider-health-service";

export type MarketingCommandActionType =
  | "CONNECT_PROVIDER"
  | "FIX_PROVIDER_CONFIG"
  | "REVIEW_RECOMMENDATION"
  | "SCALE_WINNER"
  | "CHECK_RESULTS";

export type MarketingCommandPriority = "HIGH" | "MEDIUM" | "LOW";

export type MarketingCommandAction = {
  id: string;
  type: MarketingCommandActionType;
  priority: MarketingCommandPriority;
  title: string;
  reason: string;
  href: string;
  cta: string;
};

export type MarketingCommandCenterOverview = {
  source: string;
  generatedAt: string;
  summary: {
    providerReady: number;
    providerNeedsWork: number;
    highPriorityRecommendations: number;
    winningResults: number;
    totalRevenue: number;
    averageRoas: number;
  };
  actions: MarketingCommandAction[];
};

export async function buildMarketingCommandCenterOverview(
  providerHealth: ProviderHealthOverview,
): Promise<MarketingCommandCenterOverview> {
  const [results, recommendations] = await Promise.all([
    getMarketingResultsOverview(),
    getRecommendationOverview(),
  ]);

  const actions: MarketingCommandAction[] = [];

  for (const item of providerHealth.providers) {
    if (item.status === "NOT_CONNECTED") {
      actions.push({
        id: `connect-${item.provider.key}`,
        type: "CONNECT_PROVIDER",
        priority: item.provider.implementationStatus === "PARTIAL" ? "HIGH" : "MEDIUM",
        title: `اربط منصة ${item.provider.displayName}`,
        reason: "المنصة موجودة في كاتالوج التكاملات لكنها لا تملك اتصالًا حاليًا.",
        href: "/dashboard/marketing/connections",
        cta: "إضافة اتصال",
      });
    }

    if (item.status === "MISSING" || item.status === "PARTIAL") {
      actions.push({
        id: `fix-${item.provider.key}`,
        type: "FIX_PROVIDER_CONFIG",
        priority: item.missingRequiredFields.length > 0 ? "HIGH" : "MEDIUM",
        title: `أكمل إعداد ${item.provider.displayName}`,
        reason: item.nextStep,
        href: "/dashboard/marketing/connections/catalog",
        cta: "فتح صحة التكاملات",
      });
    }
  }

  for (const recommendation of recommendations.recommendations) {
    if (recommendation.priority === "HIGH") {
      actions.push({
        id: `recommendation-${recommendation.id}`,
        type: "REVIEW_RECOMMENDATION",
        priority: "HIGH",
        title: recommendation.title,
        reason: recommendation.reason,
        href: "/dashboard/marketing/recommendations",
        cta: "فتح التوصيات",
      });
    }
  }

  for (const result of results.results.filter((item) => item.status === "WINNER")) {
    actions.push({
      id: `winner-${result.id}`,
      type: "SCALE_WINNER",
      priority: "MEDIUM",
      title: `استثمر في المادة الرابحة: ${result.assetTitle}`,
      reason: `حققت ROAS ${result.roas}x وإيراد ${result.revenue} مع ${result.donations} تبرعات.`,
      href: "/dashboard/marketing/results",
      cta: "فتح النتائج",
    });
  }

  if (results.summary.totalResults === 0) {
    actions.push({
      id: "check-results",
      type: "CHECK_RESULTS",
      priority: "LOW",
      title: "ابدأ بتسجيل نتائج التسويق",
      reason: "لا توجد نتائج تسويق كافية لبناء توصيات تشغيلية قوية.",
      href: "/dashboard/marketing/results",
      cta: "فتح نتائج التسويق",
    });
  }

  const providerNeedsWork = providerHealth.summary.partial + providerHealth.summary.missing + providerHealth.summary.notConnected;

  return {
    source: "marketing-command-center-v1",
    generatedAt: new Date().toISOString(),
    summary: {
      providerReady: providerHealth.summary.ready,
      providerNeedsWork,
      highPriorityRecommendations: recommendations.summary.highPriority,
      winningResults: results.summary.winners,
      totalRevenue: results.summary.totalRevenue,
      averageRoas: results.summary.averageRoas,
    },
    actions: actions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 12),
  };
}

function priorityRank(priority: MarketingCommandPriority) {
  if (priority === "HIGH") return 0;
  if (priority === "MEDIUM") return 1;
  return 2;
}
