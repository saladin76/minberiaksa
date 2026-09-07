export type SeasonPriority = "HIGH" | "MEDIUM" | "LOW";

export type SeasonAssetTarget = {
  label: string;
  required: number;
  ready: number;
};

export type OperationsSeasonDefinition = {
  id: string;
  title: string;
  focus: string;
  priority: SeasonPriority;
  leadTimeDays: number;
  startsInDays: number;
  assetTargets: SeasonAssetTarget[];
};

export type SeasonReadinessResult = {
  seasonId: string;
  title: string;
  focus: string;
  priority: SeasonPriority;
  startsInDays: number;
  leadTimeDays: number;
  readinessScore: number;
  requiredAssets: number;
  readyAssets: number;
  missingAssets: number;
  status: "ON_TRACK" | "NEEDS_ATTENTION" | "LATE";
  alerts: string[];
  assetTargets: SeasonAssetTarget[];
};
