import type { OperationsPersistenceInfo } from "../persistence-types";

export type ArchiveAssetType = "DESIGN" | "VIDEO" | "CAROUSEL" | "COPY" | "WHATSAPP" | "EMAIL" | "AD";

export type ArchiveAssetStatus = "DRAFT" | "READY" | "PUBLISHED" | "USED_IN_ADS" | "ARCHIVED";

export type ArchiveAsset = {
  id: string;
  title: string;
  type: ArchiveAssetType;
  status: ArchiveAssetStatus;
  seasonTitle: string;
  campaignTitle: string;
  language: string;
  owner: string;
  tags: string[];
  fileLabel: string;
  productionItemId?: string;
  usedInAds: boolean;
  performanceLabel?: string;
};

export type ArchiveOverview = {
  source: string;
  generatedAt: string;
  persistence: OperationsPersistenceInfo;
  summary: {
    totalAssets: number;
    ready: number;
    published: number;
    usedInAds: number;
    videos: number;
    designs: number;
  };
  assets: ArchiveAsset[];
  tagCloud: { tag: string; count: number }[];
};
