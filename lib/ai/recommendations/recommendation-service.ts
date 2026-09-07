import { getMarketingResultsOverview } from "@/lib/marketing/results/results-service";
import { buildMarketingResultRecommendations } from "./recommendation-rules";
import type { RecommendationOverview } from "./recommendation-types";

export async function getRecommendationOverview(): Promise<RecommendationOverview> {
  const marketingResults = await getMarketingResultsOverview();
  const recommendations = buildMarketingResultRecommendations(marketingResults.results);

  return {
    source: "rule-based-recommendation",
    generatedAt: new Date().toISOString(),
    summary: {
      total: recommendations.length,
      highPriority: recommendations.filter((item) => item.priority === "HIGH").length,
      marketing: recommendations.filter((item) => item.area === "MARKETING").length,
      operations: recommendations.filter((item) => item.area === "OPERATIONS").length,
      archive: recommendations.filter((item) => item.area === "ARCHIVE").length,
    },
    recommendations,
  };
}
