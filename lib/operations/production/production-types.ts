import type { OperationsPersistenceInfo } from "../persistence-types";

export type ProductionStage = "IDEA" | "SCRIPT" | "DESIGN" | "VIDEO" | "REVIEW" | "READY" | "PUBLISHED";

export type ProductionPriority = "HIGH" | "MEDIUM" | "LOW";

export type ProductionItem = {
  id: string;
  title: string;
  stage: ProductionStage;
  priority: ProductionPriority;
  seasonTitle: string;
  contentType: string;
  owner: string;
  dueLabel: string;
  taskId?: string;
  scriptUrl?: string;
  designUrl?: string;
  videoUrl?: string;
  isDeliveredToMarketing: boolean;
  isUsedInAds: boolean;
  resultLabel?: string;
};

export type ProductionColumn = {
  stage: ProductionStage;
  title: string;
  description: string;
  items: ProductionItem[];
};

export type ProductionBoardOverview = {
  source: string;
  generatedAt: string;
  persistence: OperationsPersistenceInfo;
  summary: {
    totalItems: number;
    inProduction: number;
    ready: number;
    published: number;
    usedInAds: number;
    highPriority: number;
  };
  columns: ProductionColumn[];
};
