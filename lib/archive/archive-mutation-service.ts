import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ArchiveCollection, ArchiveDriveLink, ArchiveProject } from "./archive-types";

const objectIdPattern = /^[a-f\d]{24}$/i;

export type ArchivePersistenceMutationResult<T> = {
  ok: boolean;
  mode: "prisma" | "foundation";
  message: string;
  externalCall: false;
  data?: T;
};

type ArchiveCollectionInput = Partial<Pick<ArchiveCollection, "name" | "slug" | "type" | "description" | "order" | "isActive">>;
type ArchiveProjectInput = Partial<ArchiveProject> & { title?: string };
type ArchiveDriveLinkInput = Partial<Pick<ArchiveDriveLink, "projectId" | "title" | "driveUrl">>;
type ArchiveActor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

type ArchiveDriveLinkRuntimeRow = {
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

type ArchiveDriveLinkCreateDelegate = {
  create(args: {
    data: {
      projectId: string;
      title: string;
      driveUrl: string;
      driveFolderId?: string | null;
      driveFileId?: string | null;
      sharedDriveId?: string | null;
      linkType: string;
      syncStatus: string;
      lastSyncedAt?: Date | null;
      lastError?: string | null;
      totalFiles?: number;
      totalImages?: number;
      totalVideos?: number;
      totalOther?: number;
      createdBy?: string | null;
    };
  }): Promise<ArchiveDriveLinkRuntimeRow>;
};

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function newObjectId() {
  return randomBytes(12).toString("hex");
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `archive-${Date.now()}`;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function extractDriveIds(rawUrl: string) {
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

function mapCollection(row: {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  order: number;
  isActive: boolean;
}): ArchiveCollection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    description: row.description ?? "to be verified",
    order: row.order,
    isActive: row.isActive,
  };
}

function mapProject(row: {
  id: string;
  collectionId: string | null;
  title: string;
  year: number | null;
  country: string | null;
  city: string | null;
  theme: string | null;
  projectType: string | null;
  description: string | null;
  implementationDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  documentationStatus: string;
  marketingStatus: string;
  notes: string | null;
  createdBy: string | null;
}): ArchiveProject {
  return {
    id: row.id,
    collectionId: row.collectionId ?? "archive_collection_unassigned",
    title: row.title,
    year: row.year ?? new Date().getFullYear(),
    country: row.country ?? "to be verified",
    city: row.city ?? "to be verified",
    theme: row.theme ?? "general",
    projectType: row.projectType ?? "General",
    description: row.description ?? "to be verified",
    implementationDate: toIso(row.implementationDate),
    startDate: toIso(row.startDate),
    endDate: toIso(row.endDate),
    status: row.status as ArchiveProject["status"],
    documentationStatus: row.documentationStatus as ArchiveProject["documentationStatus"],
    marketingStatus: row.marketingStatus as ArchiveProject["marketingStatus"],
    notes: row.notes ?? "to be verified",
    createdBy: row.createdBy ?? "archive-db",
  };
}

function mapDriveLink(row: ArchiveDriveLinkRuntimeRow): ArchiveDriveLink {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    driveUrl: row.driveUrl,
    driveFolderId: row.driveFolderId,
    driveFileId: row.driveFileId,
    sharedDriveId: row.sharedDriveId,
    linkType: row.linkType as ArchiveDriveLink["linkType"],
    syncStatus: row.syncStatus as ArchiveDriveLink["syncStatus"],
    lastSyncedAt: toIso(row.lastSyncedAt),
    lastError: row.lastError,
    totalFiles: row.totalFiles,
    totalImages: row.totalImages,
    totalVideos: row.totalVideos,
    totalOther: row.totalOther,
  };
}

function unavailable<T>(message: string): ArchivePersistenceMutationResult<T> {
  return {
    ok: false,
    mode: "foundation",
    externalCall: false,
    message,
  };
}

function getArchiveDriveLinkCreateDelegate(): ArchiveDriveLinkCreateDelegate | null {
  const prismaWithArchiveDriveLink = prisma as unknown as { archiveDriveLink?: ArchiveDriveLinkCreateDelegate };
  return prismaWithArchiveDriveLink.archiveDriveLink ?? null;
}

async function recordArchiveDriveLinkAuditLog(item: ArchiveDriveLink, actor?: ArchiveActor | null) {
  await prisma.auditLog.create({
    data: {
      actorId: safeObjectId(actor?.actorId),
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole || "ADMIN",
      action: "archive.drive-link.create",
      messageAr: "تم حفظ رابط Drive في الأرشيف",
      messageEn: "Archive Drive link saved",
      entityType: "ArchiveDriveLink",
      entityId: item.id,
      metadata: {
        ...item,
        providerSource: "MarketingPlatformConnection/provider-catalog",
        externalCall: false,
        syncStarted: false,
      },
      stream: "TEAM",
    },
  });
}

export async function createArchiveCollectionInRepository(
  input: ArchiveCollectionInput,
  actorId?: string | null,
): Promise<ArchivePersistenceMutationResult<ArchiveCollection>> {
  if (!process.env.DATABASE_URL) {
    return unavailable("DATABASE_URL is not configured; ArchiveCollection was not created.");
  }

  try {
    const order = input.order ?? (await prisma.archiveCollection.count()) + 1;
    const row = await prisma.archiveCollection.create({
      data: {
        name: input.name || "Collection to be verified",
        slug: input.slug ? slugify(input.slug) : `${slugify(input.name || "archive-collection")}-${Date.now()}`,
        type: input.type || "GENERAL",
        description: input.description || "to be verified",
        order,
        isActive: input.isActive ?? true,
        createdBy: safeObjectId(actorId),
      },
    });

    return {
      ok: true,
      mode: "prisma",
      externalCall: false,
      message: "ArchiveCollection created.",
      data: mapCollection(row),
    };
  } catch (error) {
    console.error("ArchiveCollection create failed", error);
    return { ok: false, mode: "prisma", externalCall: false, message: "ArchiveCollection create failed." };
  }
}

export async function createArchiveProjectInRepository(
  input: ArchiveProjectInput,
  actorId?: string | null,
): Promise<ArchivePersistenceMutationResult<ArchiveProject>> {
  if (!process.env.DATABASE_URL) {
    return unavailable("DATABASE_URL is not configured; ArchiveProject was not created.");
  }

  try {
    const row = await prisma.archiveProject.create({
      data: {
        collectionId: safeObjectId(input.collectionId),
        title: input.title || "Project to be verified",
        year: input.year || new Date().getFullYear(),
        country: input.country || "to be verified",
        city: input.city || "to be verified",
        theme: input.theme || "general",
        projectType: input.projectType || "General",
        description: input.description || "to be verified",
        implementationDate: input.implementationDate ? new Date(input.implementationDate) : undefined,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        status: input.status || "PLANNED",
        documentationStatus: input.documentationStatus || "NOT_STARTED",
        marketingStatus: input.marketingStatus || "NOT_REVIEWED",
        notes: input.notes || "to be verified",
        createdBy: safeObjectId(actorId),
      },
    });

    return {
      ok: true,
      mode: "prisma",
      externalCall: false,
      message: "ArchiveProject created.",
      data: mapProject(row),
    };
  } catch (error) {
    console.error("ArchiveProject create failed", error);
    return { ok: false, mode: "prisma", externalCall: false, message: "ArchiveProject create failed." };
  }
}

export async function createArchiveDriveLinkInRepository(
  input: ArchiveDriveLinkInput,
  actor?: ArchiveActor | null,
): Promise<ArchivePersistenceMutationResult<ArchiveDriveLink>> {
  if (!process.env.DATABASE_URL) {
    return unavailable("DATABASE_URL is not configured; ArchiveDriveLink was not created.");
  }

  try {
    const ids = extractDriveIds(input.driveUrl || "");
    const delegate = getArchiveDriveLinkCreateDelegate();
    const projectObjectId = safeObjectId(input.projectId);
    const syncStatus = ids.linkType === "UNKNOWN" ? "FOUNDATION" : "READY_FOR_SYNC";
    const lastError = ids.linkType === "UNKNOWN" ? "Drive folder/file id could not be detected." : null;

    if (delegate && projectObjectId) {
      const row = await delegate.create({
        data: {
          projectId: projectObjectId,
          title: input.title || "Drive link to be verified",
          driveUrl: input.driveUrl || "to be verified",
          driveFolderId: ids.driveFolderId,
          driveFileId: ids.driveFileId,
          sharedDriveId: ids.sharedDriveId,
          linkType: ids.linkType,
          syncStatus,
          lastSyncedAt: null,
          lastError,
          totalFiles: 0,
          totalImages: 0,
          totalVideos: 0,
          totalOther: 0,
          createdBy: safeObjectId(actor?.actorId) ?? null,
        },
      });
      const item = mapDriveLink(row);
      await recordArchiveDriveLinkAuditLog(item, actor);

      return {
        ok: true,
        mode: "prisma",
        externalCall: false,
        message: "ArchiveDriveLink saved in runtime model without Google Drive calls.",
        data: item,
      };
    }

    const item: ArchiveDriveLink = {
      id: newObjectId(),
      projectId: input.projectId || "archive_project_unknown",
      title: input.title || "Drive link to be verified",
      driveUrl: input.driveUrl || "to be verified",
      driveFolderId: ids.driveFolderId,
      driveFileId: ids.driveFileId,
      sharedDriveId: ids.sharedDriveId,
      linkType: ids.linkType,
      syncStatus,
      lastSyncedAt: null,
      lastError: lastError ?? (projectObjectId ? null : "ArchiveProject must be DB-backed before ArchiveDriveLink can use the runtime model."),
      totalFiles: 0,
      totalImages: 0,
      totalVideos: 0,
      totalOther: 0,
    };

    await recordArchiveDriveLinkAuditLog(item, actor);

    return {
      ok: true,
      mode: "prisma",
      externalCall: false,
      message: delegate
        ? "ArchiveDriveLink saved as audit-backed fallback because projectId is not a runtime ObjectId yet."
        : "ArchiveDriveLink saved as audit-backed fallback until runtime model is added to Prisma schema.",
      data: item,
    };
  } catch (error) {
    console.error("ArchiveDriveLink create failed", error);
    return { ok: false, mode: "prisma", externalCall: false, message: "ArchiveDriveLink create failed." };
  }
}