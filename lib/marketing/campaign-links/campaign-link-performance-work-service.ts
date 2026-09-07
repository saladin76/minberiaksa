import { buildCampaignLinkPerformanceReport, type CampaignLinkPerformanceQuery } from "./campaign-link-performance-service";
import { getWorkLinkBridge } from "./work-bridge";

export async function buildCampaignLinkPerformanceWorkReport(query: CampaignLinkPerformanceQuery) {
  const [report, workBridge] = await Promise.all([
    buildCampaignLinkPerformanceReport(query),
    getWorkLinkBridge(query.limit),
  ]);

  return {
    ...report,
    workBridge,
  };
}
