import { prisma } from "@/lib/prisma";
import {
  applyArchiveAssetReviewOverrides,
  readArchiveAssetReviewOverrides,
} from "./archive-asset-review-repository";
import type {
  ArchiveAsset,
  ArchiveCollection,
  ArchiveDriveLink,
  ArchiveProject,
  ArchiveRecommendedUse,
  ArchiveVideoFrame,
} from "./archive-types";

export type ArchiveRepositoryPersistenceMode = "db-backed" | "foundation-fallback";

export type ArchiveFoundationData = {
  collections: ArchiveCollection[];
  projects: ArchiveProject[];
  driveLinks: ArchiveDriveLink[];
  assets: ArchiveAsset[];
  videoFrames: ArchiveVideoFrame[];
};

export type ArchiveRepositorySnapshot = ArchiveFoundationData & {
  mode: ArchiveRepositoryPersistenceMode;
  source: "prisma" | "foundation";
  reason: string;
  dbCounts: {
    collections: number;
    projects: number;
    driveLinks: number;
    assets: number;
    videoFrames: number;
  };
};

type ArchiveDriveLinkRow = {
  id: string;
  projectId: string;
  title: string;
  driveUrl: string;
  driveFolderId: string | null;
  driveFileId: string | null;
  sharedDriveId: string | null;
  linkType: string;
  syncStatus: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  totalFiles: number;
  totalImages: number;
  totalVideos: number;
  totalOther: number;
};

type ArchiveAssetRow = {
  id: string;
  projectId: string;
  driveLinkId: string | null;
  googleFileId: string;
  googleFolderId: string | null;
  fileName: string;
  mimeType: string;
  fileType: string;
  webViewLink: string | null;
  webContentLink: string | null;
  thumbnailLink: string | null;
  previewUrl: string | null;
  sizeBytes: number | null;
  createdTime: Date | null;
  modifiedTime: Date | null;
  aiStatus: string;
  humanReviewStatus: string;
  marketingApproved: boolean;
  documentationApproved: boolean;
  tags: string[];
  aiSummary: string | null;
  aiWarnings: string | null;
  recommendedUse: string;
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
  reviewedAt: Date | null;
  reviewerNote: string | null;
};

type ArchiveVideoFrameRow = {
  id: string;
  assetId: string;
  timestampSec: number;
  frameUrl: string | null;
  thumbnailUrl: string | null;
  aiSummary: string | null;
  recommendedUse: string;
  marketingScore: number;
  tags: string[];
  needsBlur: boolean;
  isSensitive: boolean;
};

type ArchiveDriveLinkAuditRow = {
  id: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type ArchiveEntityAuditRow = ArchiveDriveLinkAuditRow & {
  action: string;
};

type ArchiveDriveLinkDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<ArchiveDriveLinkRow[]>;
};

type ArchiveAssetDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<ArchiveAssetRow[]>;
};

type ArchiveVideoFrameDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<ArchiveVideoFrameRow[]>;
};

const projectStatuses: ArchiveProject["status"][] = ["PLANNED", "ACTIVE", "COMPLETED", "PAUSED"];
const documentationStatuses: ArchiveProject["documentationStatus"][] = ["NOT_STARTED", "PARTIAL", "READY", "MISSING_PROOF"];
const marketingStatuses: ArchiveProject["marketingStatus"][] = ["NOT_REVIEWED", "NEEDS_REVIEW", "READY", "IN_USE"];
const linkTypes: ArchiveDriveLink["linkType"][] = ["FOLDER", "FILE", "UNKNOWN"];
const syncStatuses: ArchiveDriveLink["syncStatus"][] = ["FOUNDATION", "READY_FOR_SYNC", "SYNC_SKIPPED", "FAILED"];
const fileTypes: ArchiveAsset["fileType"][] = ["IMAGE", "VIDEO", "DOCUMENT", "FOLDER", "OTHER"];
const aiStatuses: ArchiveAsset["aiStatus"][] = ["NOT_ANALYZED", "DRAFT_REVIEW_REQUIRED", "ANALYSIS_SKIPPED"];
const reviewStatuses: ArchiveAsset["humanReviewStatus"][] = ["PENDING", "APPROVED", "REJECTED", "DOCUMENTATION_ONLY"];
const recommendedUses: ArchiveRecommendedUse[] = ["ADS", "SOCIAL_POST", "REEL", "CAROUSEL", "REPORT", "SEO_ARTICLE", "HERO", "WHATSAPP", "DOCUMENTATION_ONLY", "DO_NOT_USE"];

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function asProjectStatus(value: string | null | undefined): ArchiveProject["status"] {
  return projectStatuses.includes(value as ArchiveProject["status"]) ? (value as ArchiveProject["status"]) : "PLANNED";
}

function asDocumentationStatus(value: string | null | undefined): ArchiveProject["documentationStatus"] {
  return documentationStatuses.includes(value as ArchiveProject["documentationStatus"]) ? (value as ArchiveProject["documentationStatus"]) : "NOT_STARTED";
}

function asMarketingStatus(value: string | null | undefined): ArchiveProject["marketingStatus"] {
  return marketingStatuses.includes(value as ArchiveProject["marketingStatus"]) ? (value as ArchiveProject["marketingStatus"]) : "NOT_REVIEWED";
}

function asLinkType(value: string | null | undefined): ArchiveDriveLink["linkType"] {
  return linkTypes.includes(value as ArchiveDriveLink["linkType"]) ? (value as ArchiveDriveLink["linkType"]) : "UNKNOWN";
}

function asSyncStatus(value: string | null | undefined): ArchiveDriveLink["syncStatus"] {
  return syncStatuses.includes(value as ArchiveDriveLink["syncStatus"]) ? (value as ArchiveDriveLink["syncStatus"]) : "FOUNDATION";
}

function asFileType(value: string | null | undefined): ArchiveAsset["fileType"] {
  return fileTypes.includes(value as ArchiveAsset["fileType"]) ? (value as ArchiveAsset["fileType"]) : "OTHER";
}

function asAiStatus(value: string | null | undefined): ArchiveAsset["aiStatus"] {
  return aiStatuses.includes(value as ArchiveAsset["aiStatus"]) ? (value as ArchiveAsset["aiStatus"]) : "NOT_ANALYZED";
}

function asReviewStatus(value: string | null | undefined): ArchiveAsset["humanReviewStatus"] {
  return reviewStatuses.includes(value as ArchiveAsset["humanReviewStatus"]) ? (value as ArchiveAsset["humanReviewStatus"]) : "PENDING";
}

function asRecommendedUse(value: string | null | undefined): ArchiveRecommendedUse {
  return recommendedUses.includes(value as ArchiveRecommendedUse) ? (value as ArchiveRecommendedUse) : "DOCUMENTATION_ONLY";
}

function getArchiveDriveLinkDelegate(): ArchiveDriveLinkDelegate | null {
  const prismaWithArchiveDriveLink = prisma as unknown as { archiveDriveLink?: ArchiveDriveLinkDelegate };
  return prismaWithArchiveDriveLink.archiveDriveLink ?? null;
}

function getArchiveAssetDelegate(): ArchiveAssetDelegate | null {
  const prismaWithArchiveAsset = prisma as unknown as { archiveAsset?: ArchiveAssetDelegate };
  return prismaWithArchiveAsset.archiveAsset ?? null;
}

function getArchiveVideoFrameDelegate(): ArchiveVideoFrameDelegate | null {
  const prismaWithArchiveVideoFrame = prisma as unknown as { archiveVideoFrame?: ArchiveVideoFrameDelegate };
  return prismaWithArchiveVideoFrame.archiveVideoFrame ?? null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanField(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function auditEntityId(row: ArchiveEntityAuditRow) {
  const metadata = metadataObject(row.metadata);
  return row.entityId ?? stringField(metadata.id);
}

function applyCollectionAuditRows(items: ArchiveCollection[], rows: ArchiveEntityAuditRow[]) {
  let next = [...items];
  for (const row of rows) {
    const id = auditEntityId(row);
    if (!id) continue;
    if (row.action === "archive.collection.delete") {
      next = next.filter((collection) => collection.id !== id);
      continue;
    }
    if (row.action !== "archive.collection.update") continue;
    const metadata = metadataObject(row.metadata);
    next = next.map((collection) => collection.id === id ? { ...collection, name: stringField(metadata.name) ?? collection.name, slug: stringField(metadata.slug) ?? collection.slug, type: stringField(metadata.type) ?? collection.type, description: stringField(metadata.description) ?? collection.description, isActive: booleanField(metadata.isActive) ?? collection.isActive } : collection);
  }
  return next;
}

function applyProjectAuditRows(items: ArchiveProject[], rows: ArchiveEntityAuditRow[], validCollectionIds: Set<string>, fallbackCollectionId: string) {
  let next = [...items];
  for (const row of rows) {
    const id = auditEntityId(row);
    if (!id) continue;
    if (row.action === "archive.project.delete") {
      next = next.filter((project) => project.id !== id);
      continue;
    }
    if (row.action !== "archive.project.update") continue;
    const metadata = metadataObject(row.metadata);
    const collectionId = stringField(metadata.collectionId);
    next = next.map((project) => project.id === id ? { ...project, collectionId: collectionId && validCollectionIds.has(collectionId) ? collectionId : project.collectionId || fallbackCollectionId, title: stringField(metadata.title) ?? project.title, year: numberField(metadata.year) || project.year, country: stringField(metadata.country) ?? project.country, city: stringField(metadata.city) ?? project.city, theme: stringField(metadata.theme) ?? project.theme, projectType: stringField(metadata.projectType) ?? project.projectType, description: stringField(metadata.description) ?? project.description, notes: stringField(metadata.notes) ?? project.notes, status: asProjectStatus(stringField(metadata.status) ?? project.status), documentationStatus: asDocumentationStatus(stringField(metadata.documentationStatus) ?? project.documentationStatus), marketingStatus: asMarketingStatus(stringField(metadata.marketingStatus) ?? project.marketingStatus) } : project);
  }
  return next;
}

function mapAuditDriveLink(row: ArchiveEntityAuditRow, validProjectIds: Set<string>, fallbackProjectId: string): ArchiveDriveLink | null {
  const metadata = metadataObject(row.metadata);
  const id = stringField(metadata.id) ?? row.entityId ?? row.id;
  const projectId = stringField(metadata.projectId);
  const title = stringField(metadata.title);
  const driveUrl = stringField(metadata.driveUrl);
  if (!title || !driveUrl) return null;
  return { id, projectId: projectId && validProjectIds.has(projectId) ? projectId : fallbackProjectId, title, driveUrl, driveFolderId: stringField(metadata.driveFolderId), driveFileId: stringField(metadata.driveFileId), sharedDriveId: stringField(metadata.sharedDriveId), linkType: asLinkType(stringField(metadata.linkType)), syncStatus: asSyncStatus(stringField(metadata.syncStatus)), lastSyncedAt: stringField(metadata.lastSyncedAt), lastError: stringField(metadata.lastError), totalFiles: numberField(metadata.totalFiles), totalImages: numberField(metadata.totalImages), totalVideos: numberField(metadata.totalVideos), totalOther: numberField(metadata.totalOther) };
}

function applyDriveLinkAuditRows(items: ArchiveDriveLink[], rows: ArchiveEntityAuditRow[], validProjectIds: Set<string>, fallbackProjectId: string) {
  let next = [...items];
  for (const row of rows) {
    const id = auditEntityId(row);
    if (!id) continue;
    if (row.action === "archive.drive-link.delete") {
      next = next.filter((link) => link.id !== id);
      continue;
    }
    if (row.action !== "archive.drive-link.update") continue;
    const metadata = metadataObject(row.metadata);
    const projectId = stringField(metadata.projectId);
    next = next.map((link) => link.id === id ? { ...link, projectId: projectId && validProjectIds.has(projectId) ? projectId : fallbackProjectId, title: stringField(metadata.title) ?? link.title, driveUrl: stringField(metadata.driveUrl) ?? link.driveUrl, driveFolderId: stringField(metadata.driveFolderId), driveFileId: stringField(metadata.driveFileId), sharedDriveId: stringField(metadata.sharedDriveId), linkType: asLinkType(stringField(metadata.linkType) ?? link.linkType), syncStatus: asSyncStatus(stringField(metadata.syncStatus) ?? link.syncStatus), lastError: stringField(metadata.lastError) } : link);
  }
  return next;
}

function fallback(foundation: ArchiveFoundationData, reason: string): ArchiveRepositorySnapshot {
  return { mode: "foundation-fallback", source: "foundation", reason, collections: foundation.collections, projects: foundation.projects, driveLinks: foundation.driveLinks, assets: foundation.assets, videoFrames: foundation.videoFrames, dbCounts: { collections: 0, projects: 0, driveLinks: 0, assets: 0, videoFrames: 0 } };
}

export async function getArchiveRepositorySnapshot(foundation: ArchiveFoundationData): Promise<ArchiveRepositorySnapshot> {
  if (!process.env.DATABASE_URL) return fallback(foundation, "DATABASE_URL is not configured; using foundation archive collections, projects, links, assets, and frames.");

  try {
    const archiveDriveLinkDelegate = getArchiveDriveLinkDelegate();
    const archiveAssetDelegate = getArchiveAssetDelegate();
    const archiveVideoFrameDelegate = getArchiveVideoFrameDelegate();
    const [collectionRows, projectRows, collectionAuditRows, projectAuditRows, driveLinkRows, driveLinkAuditRows, assetRows, assetReviewOverrides, videoFrameRows] = await Promise.all([
      prisma.archiveCollection.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
      prisma.archiveProject.findMany({ orderBy: [{ year: "desc" }, { title: "asc" }] }),
      prisma.auditLog.findMany({ where: { entityType: "ArchiveCollection", action: { in: ["archive.collection.update", "archive.collection.delete"] } }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, entityId: true, action: true, metadata: true, createdAt: true } }),
      prisma.auditLog.findMany({ where: { entityType: "ArchiveProject", action: { in: ["archive.project.update", "archive.project.delete"] } }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, entityId: true, action: true, metadata: true, createdAt: true } }),
      archiveDriveLinkDelegate ? archiveDriveLinkDelegate.findMany({ orderBy: [{ title: "asc" }] }) : Promise.resolve([]),
      prisma.auditLog.findMany({ where: { entityType: "ArchiveDriveLink", action: { in: ["archive.drive-link.create", "archive.drive-link.update", "archive.drive-link.delete"] } }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, entityId: true, action: true, metadata: true, createdAt: true } }),
      archiveAssetDelegate ? archiveAssetDelegate.findMany({ orderBy: [{ fileName: "asc" }] }) : Promise.resolve([]),
      readArchiveAssetReviewOverrides(),
      archiveVideoFrameDelegate ? archiveVideoFrameDelegate.findMany({ orderBy: [{ timestampSec: "asc" }] }) : Promise.resolve([]),
    ]);

    const hasDbArchiveData = collectionRows.length > 0 || projectRows.length > 0 || collectionAuditRows.length > 0 || projectAuditRows.length > 0 || driveLinkRows.length > 0 || driveLinkAuditRows.length > 0 || assetRows.length > 0 || assetReviewOverrides.length > 0 || videoFrameRows.length > 0;
    if (!hasDbArchiveData) return fallback(foundation, "Archive runtime collections are empty; using foundation archive data.");

    const baseCollections: ArchiveCollection[] = collectionRows.length > 0 ? collectionRows.map((collection) => ({ id: collection.id, name: collection.name, slug: collection.slug, type: collection.type, description: collection.description ?? "to be verified", order: collection.order, isActive: collection.isActive })) : foundation.collections;
    const collections = applyCollectionAuditRows(baseCollections, collectionAuditRows);
    const validCollectionIds = new Set(collections.map((collection) => collection.id));
    const fallbackCollectionId = collections[0]?.id ?? foundation.collections[0]?.id ?? "archive_collection_unknown";

    const baseProjects: ArchiveProject[] = projectRows.length > 0 ? projectRows.map((project) => ({ id: project.id, collectionId: project.collectionId && validCollectionIds.has(project.collectionId) ? project.collectionId : fallbackCollectionId, title: project.title, year: project.year ?? new Date().getFullYear(), country: project.country ?? "to be verified", city: project.city ?? "to be verified", theme: project.theme ?? "general", projectType: project.projectType ?? "General", description: project.description ?? "to be verified", implementationDate: toIso(project.implementationDate), startDate: toIso(project.startDate), endDate: toIso(project.endDate), status: asProjectStatus(project.status), documentationStatus: asDocumentationStatus(project.documentationStatus), marketingStatus: asMarketingStatus(project.marketingStatus), notes: project.notes ?? "to be verified", createdBy: project.createdBy ?? "archive-db" })) : foundation.projects;
    const projects = applyProjectAuditRows(baseProjects, projectAuditRows, validCollectionIds, fallbackCollectionId);
    const validProjectIds = new Set(projects.map((project) => project.id));
    const fallbackProjectId = projects[0]?.id ?? foundation.projects[0]?.id ?? "archive_project_unknown";

    const delegatedDriveLinks = driveLinkRows.map((link): ArchiveDriveLink => ({ id: link.id, projectId: validProjectIds.has(link.projectId) ? link.projectId : fallbackProjectId, title: link.title, driveUrl: link.driveUrl, driveFolderId: link.driveFolderId, driveFileId: link.driveFileId, sharedDriveId: link.sharedDriveId, linkType: asLinkType(link.linkType), syncStatus: asSyncStatus(link.syncStatus), lastSyncedAt: toIso(link.lastSyncedAt), lastError: link.lastError, totalFiles: link.totalFiles, totalImages: link.totalImages, totalVideos: link.totalVideos, totalOther: link.totalOther }));
    const auditCreatedDriveLinks = driveLinkAuditRows.filter((row) => row.action === "archive.drive-link.create").map((row) => mapAuditDriveLink(row, validProjectIds, fallbackProjectId)).filter((link): link is ArchiveDriveLink => Boolean(link));
    const baseDriveLinks = delegatedDriveLinks.length > 0 ? delegatedDriveLinks : auditCreatedDriveLinks.length > 0 ? auditCreatedDriveLinks : foundation.driveLinks;
    const driveLinks = applyDriveLinkAuditRows(baseDriveLinks, driveLinkAuditRows, validProjectIds, fallbackProjectId);

    const validDriveLinkIds = new Set(driveLinks.map((link) => link.id));
    const persistedAssets = assetRows.map((asset): ArchiveAsset => ({ id: asset.id, projectId: validProjectIds.has(asset.projectId) ? asset.projectId : fallbackProjectId, driveLinkId: asset.driveLinkId && validDriveLinkIds.has(asset.driveLinkId) ? asset.driveLinkId : null, googleFileId: asset.googleFileId, googleFolderId: asset.googleFolderId, fileName: asset.fileName, mimeType: asset.mimeType, fileType: asFileType(asset.fileType), webViewLink: asset.webViewLink, webContentLink: asset.webContentLink, thumbnailLink: asset.thumbnailLink, previewUrl: asset.previewUrl, sizeBytes: asset.sizeBytes, createdTime: toIso(asset.createdTime), modifiedTime: toIso(asset.modifiedTime), aiStatus: asAiStatus(asset.aiStatus), humanReviewStatus: asReviewStatus(asset.humanReviewStatus), marketingApproved: asset.marketingApproved, documentationApproved: asset.documentationApproved, tags: asset.tags, aiSummary: asset.aiSummary, aiWarnings: asset.aiWarnings, recommendedUse: asRecommendedUse(asset.recommendedUse), marketingScore: asset.marketingScore, qualityScore: asset.qualityScore, emotionScore: asset.emotionScore, clarityScore: asset.clarityScore, sensitivityScore: asset.sensitivityScore, hasChildren: asset.hasChildren, hasFaces: asset.hasFaces, needsBlur: asset.needsBlur, isSensitive: asset.isSensitive, reviewedBy: asset.reviewedBy, reviewedAt: toIso(asset.reviewedAt), reviewerNote: asset.reviewerNote }));
    const assets = applyArchiveAssetReviewOverrides(persistedAssets.length > 0 ? persistedAssets : foundation.assets, assetReviewOverrides);

    const validAssetIds = new Set(assets.map((asset) => asset.id));
    const videoFrames = videoFrameRows.map((frame): ArchiveVideoFrame | null => validAssetIds.has(frame.assetId) ? { id: frame.id, assetId: frame.assetId, timestampSec: frame.timestampSec, frameUrl: frame.frameUrl, thumbnailUrl: frame.thumbnailUrl, aiSummary: frame.aiSummary, recommendedUse: asRecommendedUse(frame.recommendedUse), marketingScore: frame.marketingScore, tags: frame.tags, needsBlur: frame.needsBlur, isSensitive: frame.isSensitive } : null).filter((frame): frame is ArchiveVideoFrame => Boolean(frame));

    const availableOptionalModels = [archiveDriveLinkDelegate ? "ArchiveDriveLink" : driveLinks.length > 0 ? "ArchiveDriveLink audit-backed records" : null, archiveAssetDelegate ? "ArchiveAsset" : assetReviewOverrides.length > 0 ? "ArchiveAsset review audit-backed records" : null, archiveVideoFrameDelegate ? "ArchiveVideoFrame" : null].filter((model): model is string => Boolean(model));
    const reason = availableOptionalModels.length > 0 ? `Archive repository can read ${availableOptionalModels.join(", ")}; Drive sync, file downloads, and AI analysis remain disabled.` : "ArchiveCollection and ArchiveProject are read from Prisma; Drive links, assets, and video frames use foundation fallback until generated Prisma delegates exist.";

    return { mode: "db-backed", source: "prisma", reason, collections, projects, driveLinks, assets, videoFrames: videoFrames.length > 0 ? videoFrames : foundation.videoFrames, dbCounts: { collections: collectionRows.length, projects: projectRows.length, driveLinks: driveLinkRows.length + auditCreatedDriveLinks.length, assets: assetRows.length, videoFrames: videoFrameRows.length } };
  } catch (error) {
    console.error("Archive repository DB read failed", error);
    return fallback(foundation, "Archive repository DB read failed; using foundation archive data.");
  }
}
