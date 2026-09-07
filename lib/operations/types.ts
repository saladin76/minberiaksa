import type { OperationsPersistenceInfo } from "./persistence-types";

export type OperationsSeason = {
  id?: string;
  title: string;
  focus: string;
  status: string;
  period: string;
  required: number;
  ready: number;
  progress: number;
};

export type OperationsWeeklyTheme = {
  id?: string;
  week: string;
  theme: string;
  description: string;
};

export type OperationsContentPlan = {
  id?: string;
  title: string;
  theme: string;
  status: string;
  items: number;
  published: number;
  date: string;
};

export type OperationsContentItem = {
  id?: string;
  title: string;
  type: string;
  status: string;
  channel: string;
  due: string;
  owner?: string | null;
  language?: string | null;
  theme?: string | null;
  hook?: string | null;
  cta?: string | null;
  copy?: string | null;
  figmaUrl?: string | null;
  driveUrl?: string | null;
  videoUrl?: string | null;
  finalAssetUrl?: string | null;
  campaignLinkId?: string | null;
  adId?: string | null;
  publicationCount?: number;
  lastPublishedAt?: string | null;
  publishedPlatforms?: string[];
};

export type OperationsContentTask = {
  id?: string;
  title: string;
  owner: string;
  status: string;
  due: string;
  item: string;
};

export type OperationsOverview = {
  source: string;
  version: string;
  generatedAt: string;
  persistence?: OperationsPersistenceInfo;
  kpis: {
    openSeasons: number;
    activePlans: number;
    contentItems: number;
    openProductionTasks: number;
    readyForMarketing: number;
  };
  seasons: OperationsSeason[];
  weeklyThemes: OperationsWeeklyTheme[];
  plans: OperationsContentPlan[];
  items: OperationsContentItem[];
  tasks: OperationsContentTask[];
};
