export type ArchivePersistence = {
  mode: "foundation" | "foundation-fallback" | "db-backed";
  nextModels: string[];
  activeModels?: string[];
  dbCounts?: {
    collections: number;
    projects: number;
    driveLinks: number;
    assets: number;
    videoFrames: number;
  };
  externalSideEffects: false;
  note: string;
};

export type ArchiveTabKey =
  | "overview"
  | "collections"
  | "projects"
  | "drive-links"
  | "assets"
  | "marketing-picks"
  | "reports"
  | "ai";

export type ArchiveTab = {
  key: ArchiveTabKey;
  title: string;
  href: string;
};

export type ArchiveCollection = {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  order: number;
  isActive: boolean;
};

export type ArchiveProject = {
  id: string;
  collectionId: string;
  title: string;
  year: number;
  country: string;
  city: string;
  theme: string;
  projectType: string;
  description: string;
  implementationDate: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "PAUSED";
  documentationStatus: "NOT_STARTED" | "PARTIAL" | "READY" | "MISSING_PROOF";
  marketingStatus: "NOT_REVIEWED" | "NEEDS_REVIEW" | "READY" | "IN_USE";
  notes: string;
  createdBy: string;
};

export type ArchiveDriveLink = {
  id: string;
  projectId: string;
  title: string;
  driveUrl: string;
  driveFolderId: string | null;
  driveFileId: string | null;
  sharedDriveId: string | null;
  linkType: "FOLDER" | "FILE" | "UNKNOWN";
  syncStatus: "FOUNDATION" | "READY_FOR_SYNC" | "SYNC_SKIPPED" | "FAILED";
  lastSyncedAt: string | null;
  lastError: string | null;
  totalFiles: number;
  totalImages: number;
  totalVideos: number;
  totalOther: number;
};

export type ArchiveRecommendedUse =
  | "ADS"
  | "SOCIAL_POST"
  | "REEL"
  | "CAROUSEL"
  | "REPORT"
  | "SEO_ARTICLE"
  | "HERO"
  | "WHATSAPP"
  | "DOCUMENTATION_ONLY"
  | "DO_NOT_USE";

export type ArchiveAsset = {
  id: string;
  projectId: string;
  driveLinkId: string | null;
  googleFileId: string;
  googleFolderId: string | null;
  fileName: string;
  mimeType: string;
  fileType: "IMAGE" | "VIDEO" | "DOCUMENT" | "FOLDER" | "OTHER";
  webViewLink: string | null;
  webContentLink: string | null;
  thumbnailLink: string | null;
  previewUrl: string | null;
  sizeBytes: number | null;
  createdTime: string | null;
  modifiedTime: string | null;
  aiStatus: "NOT_ANALYZED" | "DRAFT_REVIEW_REQUIRED" | "ANALYSIS_SKIPPED";
  humanReviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "DOCUMENTATION_ONLY";
  marketingApproved: boolean;
  documentationApproved: boolean;
  tags: string[];
  aiSummary: string | null;
  aiWarnings: string | null;
  recommendedUse: ArchiveRecommendedUse;
  marketingScore: number;
  qualityScore: number;
  emotionScore: number;
  clarityScore: number;
  sensitivityScore: number;
  hasChildren: boolean;
  hasFaces: boolean;
  needsBlur: boolean;
  isSensitive: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
};

export type ArchiveVideoFrame = {
  id: string;
  assetId: string;
  timestampSec: number;
  frameUrl: string | null;
  thumbnailUrl: string | null;
  aiSummary: string | null;
  recommendedUse: ArchiveRecommendedUse;
  marketingScore: number;
  tags: string[];
  needsBlur: boolean;
  isSensitive: boolean;
};

export type ArchiveSnapshot = {
  source: "smart-archive-foundation" | "smart-archive-db-backed";
  generatedAt: string;
  persistence: ArchivePersistence;
  tabs: ArchiveTab[];
  collections: ArchiveCollection[];
  projects: ArchiveProject[];
  driveLinks: ArchiveDriveLink[];
  assets: ArchiveAsset[];
  marketingPicks: ArchiveAsset[];
  videoFrames: ArchiveVideoFrame[];
  summary: {
    collections: number;
    projects: number;
    driveLinks: number;
    assets: number;
    marketingReady: number;
    pendingHumanReview: number;
    sensitiveAssets: number;
    reports: number;
  };
  warnings: string[];
  flows: string[];
  safety: {
    noAutoAnalysis: true;
    noExternalDriveCall: true;
    humanApprovalRequired: true;
    usesOperationTaskContract: true;
    usesSharedAiCore: true;
  };
};

export type ArchiveActionResult = {
  ok: boolean;
  mode: "foundation";
  message: string;
  externalCall: false;
  data?: unknown;
};
