import { recordAiAuditLog } from "@/lib/ai/core/ai-audit-log";
import {
  getArchiveRepositorySnapshot,
  type ArchiveFoundationData,
  type ArchiveRepositorySnapshot,
} from "./archive-repository";
import type {
  ArchiveActionResult,
  ArchiveAsset,
  ArchiveCollection,
  ArchiveDriveLink,
  ArchiveProject,
  ArchiveSnapshot,
  ArchiveTab,
  ArchiveVideoFrame,
} from "./archive-types";

const nowIso = () => new Date().toISOString();

export const ARCHIVE_TABS: ArchiveTab[] = [
  { key: "overview", title: "Overview", href: "/dashboard/archive" },
  { key: "collections", title: "Collections", href: "/dashboard/archive/collections" },
  { key: "projects", title: "Projects", href: "/dashboard/archive/projects" },
  { key: "drive-links", title: "Drive Links", href: "/dashboard/archive/drive-links" },
  { key: "assets", title: "Assets Review", href: "/dashboard/archive/assets" },
  { key: "marketing-picks", title: "Marketing Picks", href: "/dashboard/archive/marketing-picks" },
  { key: "reports", title: "Reports Archive", href: "/dashboard/archive/reports" },
  { key: "ai", title: "Archive AI", href: "/dashboard/archive/ai" },
];

const nextModels = [
  "ArchiveCollection",
  "ArchiveProject",
  "ArchiveDriveLink",
  "ArchiveAsset",
  "ArchiveVideoFrame",
  "ContentItem",
  "OperationTask",
];

let collections: ArchiveCollection[] = [
  { id: "archive_collection_gaza", name: "غزة", slug: "gaza", type: "EMERGENCY", description: "Field documentation, proof files, and reusable campaign material for Gaza work.", order: 1, isActive: true },
  { id: "archive_collection_al_quds", name: "القدس", slug: "al-quds", type: "AL_QUDS", description: "Al-Quds implementation proof, reports, and approved visuals.", order: 2, isActive: true },
  { id: "archive_collection_waqf", name: "الوقف", slug: "waqf", type: "WAQF", description: "Waqf reports, certificates, and long-term proof assets.", order: 3, isActive: true },
  { id: "archive_collection_zakat", name: "الزكاة", slug: "zakat", type: "ZAKAT", description: "Zakat documentation and eligibility proof packets.", order: 4, isActive: true },
];

let projects: ArchiveProject[] = [
  {
    id: "archive_project_gaza_2025_water",
    collectionId: "archive_collection_gaza",
    title: "غزة 2025 - مياه ومساعدات طارئة",
    year: 2025,
    country: "Palestine",
    city: "Gaza",
    theme: "غزة",
    projectType: "Emergency aid",
    description: "Foundation project for Drive metadata and field proof review.",
    implementationDate: "2025-05-20T00:00:00.000Z",
    startDate: "2025-05-01T00:00:00.000Z",
    endDate: null,
    status: "ACTIVE",
    documentationStatus: "PARTIAL",
    marketingStatus: "NEEDS_REVIEW",
    notes: "Drive link and report packet still need verification.",
    createdBy: "archive-foundation",
  },
  {
    id: "archive_project_quds_2026_iftar",
    collectionId: "archive_collection_al_quds",
    title: "القدس 2026 - إفطار",
    year: 2026,
    country: "Palestine",
    city: "Al-Quds",
    theme: "القدس",
    projectType: "Iftar",
    description: "Planned Al-Quds documentation flow. Dates remain to be verified by operations.",
    implementationDate: null,
    startDate: null,
    endDate: null,
    status: "PLANNED",
    documentationStatus: "NOT_STARTED",
    marketingStatus: "NOT_REVIEWED",
    notes: "Attach official Drive folder before sync.",
    createdBy: "archive-foundation",
  },
];

let driveLinks: ArchiveDriveLink[] = [
  {
    id: "archive_drive_gaza_foundation",
    projectId: "archive_project_gaza_2025_water",
    title: "Gaza water folder",
    driveUrl: "to be verified",
    driveFolderId: null,
    driveFileId: null,
    sharedDriveId: null,
    linkType: "UNKNOWN",
    syncStatus: "FOUNDATION",
    lastSyncedAt: null,
    lastError: "Google Drive provider is not configured for archive sync in production.",
    totalFiles: 0,
    totalImages: 0,
    totalVideos: 0,
    totalOther: 0,
  },
];

let assets: ArchiveAsset[] = [
  {
    id: "archive_asset_gaza_photo_foundation",
    projectId: "archive_project_gaza_2025_water",
    driveLinkId: "archive_drive_gaza_foundation",
    googleFileId: "to-be-synced-photo",
    googleFolderId: null,
    fileName: "gaza-field-update-photo.jpg",
    mimeType: "image/jpeg",
    fileType: "IMAGE",
    webViewLink: null,
    webContentLink: null,
    thumbnailLink: null,
    previewUrl: null,
    sizeBytes: null,
    createdTime: null,
    modifiedTime: null,
    aiStatus: "DRAFT_REVIEW_REQUIRED",
    humanReviewStatus: "PENDING",
    marketingApproved: false,
    documentationApproved: true,
    tags: ["gaza", "field-update", "proof"],
    aiSummary: "Foundation draft. Human review required before marketing use.",
    aiWarnings: "Original Drive file must be verified before public campaign use.",
    recommendedUse: "SOCIAL_POST",
    marketingScore: 72,
    qualityScore: 65,
    emotionScore: 70,
    clarityScore: 62,
    sensitivityScore: 45,
    hasChildren: false,
    hasFaces: false,
    needsBlur: false,
    isSensitive: true,
    reviewedBy: null,
    reviewedAt: null,
    reviewerNote: null,
  },
  {
    id: "archive_asset_quds_report_foundation",
    projectId: "archive_project_quds_2026_iftar",
    driveLinkId: null,
    googleFileId: "to-be-synced-report",
    googleFolderId: null,
    fileName: "al-quds-waqf-report.pdf",
    mimeType: "application/pdf",
    fileType: "DOCUMENT",
    webViewLink: null,
    webContentLink: null,
    thumbnailLink: null,
    previewUrl: null,
    sizeBytes: null,
    createdTime: null,
    modifiedTime: null,
    aiStatus: "NOT_ANALYZED",
    humanReviewStatus: "PENDING",
    marketingApproved: false,
    documentationApproved: false,
    tags: ["waqf", "report", "al-quds"],
    aiSummary: null,
    aiWarnings: null,
    recommendedUse: "REPORT",
    marketingScore: 40,
    qualityScore: 55,
    emotionScore: 20,
    clarityScore: 60,
    sensitivityScore: 15,
    hasChildren: false,
    hasFaces: false,
    needsBlur: false,
    isSensitive: false,
    reviewedBy: null,
    reviewedAt: null,
    reviewerNote: null,
  },
];

let videoFrames: ArchiveVideoFrame[] = [
  {
    id: "archive_frame_foundation_10s",
    assetId: "archive_asset_gaza_video_foundation",
    timestampSec: 10,
    frameUrl: null,
    thumbnailUrl: null,
    aiSummary: "Foundation frame placeholder. Real extraction must use the video frame provider later.",
    recommendedUse: "REEL",
    marketingScore: 60,
    tags: ["field-update"],
    needsBlur: false,
    isSensitive: true,
  },
];

function sortedCollections(items: ArchiveCollection[]) {
  return [...items].sort((a, b) => a.order - b.order);
}

/**
 * Exported so API routes can call `getArchiveRepositorySnapshot(foundationArchiveData())`.
 * That argument is REQUIRED: the repository's `fallback()` path dereferences
 * `foundation.collections` immediately, so calling it with no argument threw an uncaught
 * TypeError whenever the DB was unreachable or the archive tables were empty.
 */
export function foundationArchiveData(): ArchiveFoundationData {
  return {
    collections: sortedCollections(collections),
    projects: [...projects],
    driveLinks: [...driveLinks],
    assets: [...assets],
    videoFrames: [...videoFrames],
  };
}

function activeArchiveModels(repository: ArchiveRepositorySnapshot): string[] {
  if (repository.mode !== "db-backed") return [];
  return [
    "ArchiveCollection",
    "ArchiveProject",
    ...(repository.dbCounts.driveLinks > 0 ? ["ArchiveDriveLink"] : []),
    ...(repository.dbCounts.assets > 0 ? ["ArchiveAsset"] : []),
    ...(repository.dbCounts.videoFrames > 0 ? ["ArchiveVideoFrame"] : []),
  ];
}

function persistence(repository?: ArchiveRepositorySnapshot): ArchiveSnapshot["persistence"] {
  if (repository?.mode === "db-backed") {
    return {
      mode: "db-backed",
      nextModels,
      activeModels: activeArchiveModels(repository),
      dbCounts: repository.dbCounts,
      externalSideEffects: false,
      note: repository.reason,
    };
  }

  if (repository?.mode === "foundation-fallback") {
    return {
      mode: "foundation-fallback",
      nextModels,
      activeModels: [],
      dbCounts: repository.dbCounts,
      externalSideEffects: false,
      note: repository.reason,
    };
  }

  return {
    mode: "foundation",
    nextModels,
    activeModels: [],
    dbCounts: { collections: 0, projects: 0, driveLinks: 0, assets: 0, videoFrames: 0 },
    externalSideEffects: false,
    note: "Smart Archive is using repository/service contracts and foundation data. DB migration and Google Drive sync can be added safely next.",
  };
}

function projectFor(asset: ArchiveAsset) {
  return projects.find((project) => project.id === asset.projectId) ?? null;
}

function marketingPicks(sourceAssets: ArchiveAsset[]) {
  return sourceAssets.filter((asset) => asset.marketingApproved || (!asset.isSensitive && asset.marketingScore >= 65 && asset.humanReviewStatus !== "REJECTED"));
}

function buildArchiveSnapshot(repository?: ArchiveRepositorySnapshot): ArchiveSnapshot {
  const activeCollections = repository ? sortedCollections(repository.collections) : sortedCollections(collections);
  const activeProjects = repository ? [...repository.projects] : [...projects];
  const activeDriveLinks = repository ? [...repository.driveLinks] : [...driveLinks];
  const activeAssets = repository ? [...repository.assets] : [...assets];
  const activeVideoFrames = repository ? [...repository.videoFrames] : [...videoFrames];
  const activeMarketingPicks = marketingPicks(activeAssets);

  return {
    source: repository?.mode === "db-backed" ? "smart-archive-db-backed" : "smart-archive-foundation",
    generatedAt: nowIso(),
    persistence: persistence(repository),
    tabs: ARCHIVE_TABS,
    collections: activeCollections,
    projects: activeProjects,
    driveLinks: activeDriveLinks,
    assets: activeAssets,
    marketingPicks: activeMarketingPicks,
    videoFrames: activeVideoFrames,
    summary: {
      collections: activeCollections.length,
      projects: activeProjects.length,
      driveLinks: activeDriveLinks.length,
      assets: activeAssets.length,
      marketingReady: activeMarketingPicks.length,
      pendingHumanReview: activeAssets.filter((asset) => asset.humanReviewStatus === "PENDING").length,
      sensitiveAssets: activeAssets.filter((asset) => asset.isSensitive || asset.needsBlur).length,
      reports: activeAssets.filter((asset) => asset.recommendedUse === "REPORT" || asset.fileType === "DOCUMENT").length,
    },
    warnings: [
      "Google Drive sync is not automatic and makes no external call in foundation mode.",
      "AI analysis is draft-only and human review is required before marketing use.",
      "Sensitive assets and assets needing blur are excluded from Marketing Picks until approved.",
      repository?.mode === "db-backed"
        ? "Archive repository is DB-backed where generated delegates exist. Drive sync, AI analysis, approvals, and task creation remain manual/foundation-first."
        : "Archive data is using foundation fallback until database rows are available.",
    ],
    flows: [
      "Google Drive Folder -> ArchiveProject -> ArchiveDriveLink -> ArchiveAsset metadata",
      "AI draft analysis -> Human Review -> Marketing Picks",
      "ArchiveAsset -> Create ContentItem -> Assign OperationTask -> Publish through Operations",
      "Marketing Results -> Learning, without duplicating ad performance tables",
    ],
    safety: {
      noAutoAnalysis: true,
      noExternalDriveCall: true,
      humanApprovalRequired: true,
      usesOperationTaskContract: true,
      usesSharedAiCore: true,
    },
  };
}

export function getArchiveSnapshot(): ArchiveSnapshot {
  return buildArchiveSnapshot();
}

export async function getArchiveSnapshotDbBacked(): Promise<ArchiveSnapshot> {
  const repository = await getArchiveRepositorySnapshot(foundationArchiveData());
  return buildArchiveSnapshot(repository);
}

export function listArchiveCollections() {
  return getArchiveSnapshot().collections;
}

export function listArchiveProjects() {
  return getArchiveSnapshot().projects;
}

export function listArchiveDriveLinks() {
  return getArchiveSnapshot().driveLinks;
}

export function listArchiveAssets() {
  return getArchiveSnapshot().assets;
}

export function listArchiveVideoFrames() {
  return getArchiveSnapshot().videoFrames;
}

export function getArchiveAsset(id: string) {
  return assets.find((asset) => asset.id === id) ?? null;
}

export function extractDriveIds(rawUrl: string) {
  const value = String(rawUrl ?? "").trim();
  if (!value || value === "to be verified") return { driveFolderId: null, driveFileId: null, sharedDriveId: null, linkType: "UNKNOWN" as const };

  try {
    const url = new URL(value);
    const folder = url.pathname.match(/\/folders\/([^/?#]+)/)?.[1] ?? null;
    const file = url.pathname.match(/\/file\/d\/([^/?#]+)/)?.[1] ?? url.searchParams.get("id");
    const sharedDriveId = url.searchParams.get("driveId") ?? null;
    return {
      driveFolderId: folder,
      driveFileId: folder ? null : file,
      sharedDriveId,
      linkType: folder ? "FOLDER" as const : file ? "FILE" as const : "UNKNOWN" as const,
    };
  } catch {
    const folder = value.match(/folders\/([^/?#]+)/)?.[1] ?? null;
    const file = value.match(/file\/d\/([^/?#]+)/)?.[1] ?? value.match(/[?&]id=([^&#]+)/)?.[1] ?? null;
    return { driveFolderId: folder, driveFileId: folder ? null : file, sharedDriveId: null, linkType: folder ? "FOLDER" as const : file ? "FILE" as const : "UNKNOWN" as const };
  }
}

export function createArchiveCollection(input: Partial<ArchiveCollection>): ArchiveActionResult {
  const id = `archive_collection_${Date.now()}`;
  const item: ArchiveCollection = {
    id,
    name: input.name || "Collection to be verified",
    slug: input.slug || id,
    type: input.type || "GENERAL",
    description: input.description || "Foundation collection created through API contract.",
    order: input.order ?? collections.length + 1,
    isActive: input.isActive ?? true,
  };
  collections = [...collections, item];
  return { ok: true, mode: "foundation", externalCall: false, message: "Collection stored in foundation memory contract.", data: item };
}

export function createArchiveProject(input: Partial<ArchiveProject>): ArchiveActionResult {
  const id = `archive_project_${Date.now()}`;
  const item: ArchiveProject = {
    id,
    collectionId: input.collectionId || collections[0]?.id || "archive_collection_unknown",
    title: input.title || "Project to be verified",
    year: input.year || new Date().getFullYear(),
    country: input.country || "to be verified",
    city: input.city || "to be verified",
    theme: input.theme || "general",
    projectType: input.projectType || "General",
    description: input.description || "Foundation project created through API contract.",
    implementationDate: input.implementationDate || null,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    status: input.status || "PLANNED",
    documentationStatus: input.documentationStatus || "NOT_STARTED",
    marketingStatus: input.marketingStatus || "NOT_REVIEWED",
    notes: input.notes || "to be verified",
    createdBy: input.createdBy || "archive-api",
  };
  projects = [...projects, item];
  return { ok: true, mode: "foundation", externalCall: false, message: "Project stored in foundation memory contract.", data: item };
}

export function createArchiveDriveLink(input: { projectId?: string; title?: string; driveUrl?: string }): ArchiveActionResult {
  const ids = extractDriveIds(input.driveUrl || "");
  const item: ArchiveDriveLink = {
    id: `archive_drive_${Date.now()}`,
    projectId: input.projectId || projects[0]?.id || "archive_project_unknown",
    title: input.title || "Drive link to be verified",
    driveUrl: input.driveUrl || "to be verified",
    driveFolderId: ids.driveFolderId,
    driveFileId: ids.driveFileId,
    sharedDriveId: ids.sharedDriveId,
    linkType: ids.linkType,
    syncStatus: ids.linkType === "UNKNOWN" ? "FOUNDATION" : "READY_FOR_SYNC",
    lastSyncedAt: null,
    lastError: ids.linkType === "UNKNOWN" ? "Drive folder/file id could not be detected." : null,
    totalFiles: 0,
    totalImages: 0,
    totalVideos: 0,
    totalOther: 0,
  };
  driveLinks = [...driveLinks, item];
  return { ok: true, mode: "foundation", externalCall: false, message: "Drive link parsed and stored without calling Google Drive.", data: item };
}

export function testDriveLinkAccess(id: string): ArchiveActionResult {
  const link = driveLinks.find((item) => item.id === id);
  if (!link) return { ok: false, mode: "foundation", externalCall: false, message: "Drive link not found." };
  return {
    ok: Boolean(link.driveFolderId || link.driveFileId),
    mode: "foundation",
    externalCall: false,
    message: link.driveFolderId || link.driveFileId ? "Drive id parsed. Real access test requires configured Google Drive provider." : "No Drive id parsed yet.",
    data: { link, providerSource: "MarketingPlatformConnection / provider catalog", scopes: ["drive.file preferred", "drive.readonly only when justified"] },
  };
}

export function syncDriveLinkMetadata(id: string): ArchiveActionResult {
  const link = driveLinks.find((item) => item.id === id);
  if (!link) return { ok: false, mode: "foundation", externalCall: false, message: "Drive link not found." };
  link.syncStatus = "SYNC_SKIPPED";
  link.lastError = "Foundation mode: Google Drive metadata sync is ready but no external call was made.";
  return { ok: true, mode: "foundation", externalCall: false, message: "Sync skipped safely. Metadata sync contract is ready for provider-backed implementation.", data: link };
}

export function analyzeArchiveAsset(id: string, user = "dashboard-user"): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  asset.aiStatus = "DRAFT_REVIEW_REQUIRED";
  asset.aiSummary = asset.aiSummary || "Draft AI analysis foundation. Human review required before approval.";
  asset.aiWarnings = asset.isSensitive || asset.hasChildren || asset.hasFaces ? "Sensitive indicators require human review." : "No automatic approval. Human review still required.";
  recordAiAuditLog({
    prompt: `Archive asset draft analysis: ${asset.fileName}`,
    context: "archive",
    requestedTool: "getArchiveSummary",
    user,
    status: "COMPLETED",
  });
  return { ok: true, mode: "foundation", externalCall: false, message: "AI draft analysis prepared without external AI call.", data: { asset, humanReviewRequired: true } };
}

export function approveAssetForMarketing(id: string, user = "dashboard-user"): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  asset.marketingApproved = true;
  asset.humanReviewStatus = "APPROVED";
  asset.reviewedBy = user;
  asset.reviewedAt = nowIso();
  return { ok: true, mode: "foundation", externalCall: false, message: "Asset approved for marketing in foundation contract.", data: asset };
}

export function approveAssetForDocumentation(id: string, user = "dashboard-user"): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  asset.documentationApproved = true;
  asset.humanReviewStatus = asset.marketingApproved ? "APPROVED" : "DOCUMENTATION_ONLY";
  asset.reviewedBy = user;
  asset.reviewedAt = nowIso();
  return { ok: true, mode: "foundation", externalCall: false, message: "Asset approved for documentation.", data: asset };
}

export function rejectArchiveAsset(id: string, user = "dashboard-user"): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  asset.marketingApproved = false;
  asset.documentationApproved = false;
  asset.humanReviewStatus = "REJECTED";
  asset.reviewedBy = user;
  asset.reviewedAt = nowIso();
  return { ok: true, mode: "foundation", externalCall: false, message: "Asset rejected in foundation review contract.", data: asset };
}

export function createContentItemFromArchiveAsset(id: string): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  const project = projectFor(asset);
  return {
    ok: true,
    mode: "foundation",
    externalCall: false,
    message: "ContentItem proposal created from ArchiveAsset. Persist through Operations repository next.",
    data: {
      model: "ContentItem",
      title: asset.fileName.replace(/\.[^.]+$/, ""),
      sourceType: "ARCHIVE_ASSET",
      sourceAssetId: asset.id,
      sourceProjectId: asset.projectId,
      driveUrl: asset.webViewLink,
      finalAssetUrl: asset.previewUrl,
      theme: project?.theme ?? "archive",
      proposedCopy: asset.aiSummary,
      status: "IDEA",
      reviewStatus: "PENDING",
    },
  };
}

export function assignOperationTaskFromArchiveAsset(id: string): ArchiveActionResult {
  const asset = getArchiveAsset(id);
  if (!asset) return { ok: false, mode: "foundation", externalCall: false, message: "Asset not found." };
  return {
    ok: true,
    mode: "foundation",
    externalCall: false,
    message: "OperationTask proposal created. Archive does not own a separate task system.",
    data: {
      model: "OperationTask",
      title: `Review archive asset: ${asset.fileName}`,
      sourceType: "ARCHIVE_ASSET",
      sourceAssetId: asset.id,
      status: "PENDING",
      stream: "archive-review",
    },
  };
}

export function runArchiveAiDraft(prompt: string, user = "dashboard-user"): ArchiveActionResult {
  const audit = recordAiAuditLog({ prompt, context: "archive", requestedTool: "getArchiveSummary", user, status: "COMPLETED" });
  return {
    ok: true,
    mode: "foundation",
    externalCall: false,
    message: "Archive AI draft created through Shared AI Core audit foundation.",
    data: {
      auditId: audit.id,
      summary: "Archive AI can summarize collections, suggest tags, and prepare captions only as drafts.",
      blockedActions: ["No auto-analysis", "No auto-approval", "No auto-publish", "No external Drive or AI call in foundation mode"],
      humanReviewRequired: true,
    },
  };
}
