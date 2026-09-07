import { buildMarketingCommandCenterOverview } from "@/lib/marketing/command-center/command-center-service";
import { buildProviderHealthOverview } from "@/lib/marketing/integrations/provider-health-service";
import { getOperationsOverview } from "@/lib/operations/service";
import { buildOperationsCommandCenterOverview } from "@/lib/operations/command-center/command-center-service";
import type { MarketingPlatformConnection } from "@prisma/client";
import { serializeConnection } from "@/lib/marketing/connection-serializer";

export type ExecutiveRiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type ExecutiveSystemOverview = {
  source: string;
  generatedAt: string;
  summary: {
    marketingActions: number;
    operationsActions: number;
    providerReady: number;
    providerNeedsWork: number;
    blockedTasks: number;
    productionReady: number;
    totalRevenue: number;
    averageRoas: number;
  };
  risks: {
    id: string;
    level: ExecutiveRiskLevel;
    title: string;
    reason: string;
    href: string;
  }[];
};

export async function buildExecutiveSystemOverview(
  connections: MarketingPlatformConnection[],
): Promise<ExecutiveSystemOverview> {
  const operations = await getOperationsOverview();
  const providerHealth = buildProviderHealthOverview(connections.map(serializeConnection));
  const marketing = await buildMarketingCommandCenterOverview(providerHealth);
  const operationsCommand = await buildOperationsCommandCenterOverview(operations);

  const risks: ExecutiveSystemOverview["risks"] = [];

  if (marketing.summary.providerNeedsWork > 0) {
    risks.push({
      id: "provider-readiness",
      level: marketing.summary.providerNeedsWork >= 5 ? "HIGH" : "MEDIUM",
      title: "تكاملات تحتاج استكمال",
      reason: `يوجد ${marketing.summary.providerNeedsWork} مزود أو اتصال يحتاج مراجعة قبل الاعتماد التشغيلي الكامل.`,
      href: "/dashboard/marketing/connections/catalog",
    });
  }

  // The "مهام إنتاج محجوبة" and "مواد جاهزة للتسويق" risks both linked into /dashboard/operations,
  // removed with التشغيل. A risk card exists to be acted on, and there is no page left to act on
  // these — the underlying counts still feed the summary figures below.

  // The "توصيات تسويق عاجلة" risk linked into /dashboard/marketing/recommendations, which was
  // removed along with the marketing overview and performance pages — same reasoning as above:
  // a risk card with nowhere to go is not a risk card. The count still feeds the summary below.

  return {
    source: "executive-system-overview-v1",
    generatedAt: new Date().toISOString(),
    summary: {
      marketingActions: marketing.actions.length,
      operationsActions: operationsCommand.actions.length,
      providerReady: marketing.summary.providerReady,
      providerNeedsWork: marketing.summary.providerNeedsWork,
      blockedTasks: operationsCommand.summary.blockedTasks,
      productionReady: operationsCommand.summary.productionReady,
      totalRevenue: marketing.summary.totalRevenue,
      averageRoas: marketing.summary.averageRoas,
    },
    risks: risks.sort((a, b) => riskRank(a.level) - riskRank(b.level)).slice(0, 8),
  };
}

function riskRank(level: ExecutiveRiskLevel) {
  if (level === "HIGH") return 0;
  if (level === "MEDIUM") return 1;
  return 2;
}
