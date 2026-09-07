export type RecommendationArea = "OPERATIONS" | "MARKETING" | "ARCHIVE" | "EXECUTIVE";

export type RecommendationPriority = "HIGH" | "MEDIUM" | "LOW";

export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type RecommendationType =
  | "SCALE_WINNER"
  | "IMPROVE_CREATIVE"
  | "FIX_TRACKING"
  | "REUSE_ASSET"
  | "PAUSE_OR_REWORK"
  | "PREPARE_SEASON";

export type RecommendationItem = {
  id: string;
  area: RecommendationArea;
  type: RecommendationType;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  title: string;
  reason: string;
  suggestedAction: string;
  expectedImpact: string;
  sourceIds: string[];
};

export type RecommendationOverview = {
  source: string;
  generatedAt: string;
  summary: {
    total: number;
    highPriority: number;
    marketing: number;
    operations: number;
    archive: number;
  };
  recommendations: RecommendationItem[];
};
