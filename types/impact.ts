export type ContentDataStatus = "verified" | "requires-verification" | "data-required" | "report-pending" | "media-required";

export type ImpactDocument = {
  id: string;
  title: string;
  kind: "field-report" | "delivery-proof" | "project-report" | "official-letter" | "certificate" | "field-photos";
  status: ContentDataStatus;
  assetId?: string;
  note?: string;
};

export type ImpactRecord = {
  id: string;
  projectId: string;
  regionLabel: string;
  executionType: string;
  stage: string;
  updatedAt?: string;
  updateSummary: string;
  status: ContentDataStatus;
  sourceLabel: string;
  documentIds: string[];
  mediaCount?: number;
};

export type ImpactRegion = {
  id: string;
  label: string;
  projectIds: string[];
  latestUpdate: string;
  impactType: string;
  status: ContentDataStatus;
};

export type ImpactStory = {
  id: string;
  projectId: string;
  title: string;
  challenge: string;
  intervention: string;
  currentState: string;
  documentId?: string;
  status: ContentDataStatus;
};
