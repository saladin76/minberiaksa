import { prisma } from "@/lib/prisma";
import type { OperationsContentItem } from "./types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const manualPublicationAction = "operations.content-publication.manual-upsert";
const publicationActions = [manualPublicationAction];
const allowedStatuses = new Set(["SCHEDULED", "READY_FOR_MANUAL_SEND", "PUBLISHED", "MANUALLY_SENT", "CANCELLED", "FAILED"]);

export type ContentPublicationActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type ContentPublication = {
  id: string;
  contentItemId: string;
  platform: string;
  status: string;
  publishedUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  checkedBy: string | null;
  notes: string | null;
};

export type ContentPublicationWriteInput = {
  contentItemId?: string | null;
  platform?: string | null;
  status?: string | null;
  publishedUrl?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  notes?: string | null;
};

export type ContentPublicationResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: ContentPublication;
};

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeUrl(value: unknown) {
  const text = stringField(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeIso(value: unknown) {
  const text = stringField(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function generatedPublicationId() {
  return `content_publication_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeStatus(value: unknown) {
  const status = stringField(value)?.toUpperCase() ?? "PUBLISHED";
  return allowedStatuses.has(status) ? status : "PUBLISHED";
}

function publicationFromMetadata(metadata: unknown): ContentPublication | null {
  const root = metadataObject(metadata);
  const publication = metadataObject(root.contentPublication);
  const id = stringField(publication.id);
  const contentItemId = stringField(publication.contentItemId);
  const platform = stringField(publication.platform);
  if (!id || !contentItemId || !platform) return null;

  return {
    id,
    contentItemId,
    platform,
    status: sanitizeStatus(publication.status),
    publishedUrl: safeUrl(publication.publishedUrl),
    scheduledAt: safeIso(publication.scheduledAt),
    publishedAt: safeIso(publication.publishedAt),
    checkedBy: stringField(publication.checkedBy),
    notes: stringField(publication.notes),
  };
}

export async function readAuditBackedContentPublications(): Promise<ContentPublication[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "ContentPublication", action: { in: publicationActions } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { metadata: true },
    });

    const latest = new Map<string, ContentPublication>();
    for (const row of rows) {
      const publication = publicationFromMetadata(row.metadata);
      if (!publication) continue;
      const key = `${publication.contentItemId}:${publication.platform}`;
      if (!latest.has(key)) latest.set(key, publication);
    }

    return [...latest.values()];
  } catch (error) {
    console.error("Audit-backed content publication read failed", error);
    return [];
  }
}

export async function createAuditBackedContentPublication(
  input: ContentPublicationWriteInput,
  actor?: ContentPublicationActor | null,
  contentItem?: OperationsContentItem | null,
): Promise<ContentPublicationResult> {
  const contentItemId = stringField(input.contentItemId) ?? contentItem?.id ?? null;
  if (!contentItemId) {
    return { ok: false, mode: "foundation", externalCall: false, status: 400, message: "Content item id is required." };
  }
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; publication was not saved." };
  }

  const status = sanitizeStatus(input.status);
  const now = new Date().toISOString();
  const publication: ContentPublication = {
    id: generatedPublicationId(),
    contentItemId,
    platform: stringField(input.platform) ?? contentItem?.channel ?? "Manual",
    status,
    publishedUrl: safeUrl(input.publishedUrl),
    scheduledAt: safeIso(input.scheduledAt),
    publishedAt: safeIso(input.publishedAt) ?? (["PUBLISHED", "MANUALLY_SENT", "READY_FOR_MANUAL_SEND", "CANCELLED", "FAILED"].includes(status) ? now : null),
    checkedBy: actor?.actorName ?? actor?.actorId ?? "dashboard-user",
    notes: stringField(input.notes) ?? "Manual publication marker only. No automatic sending or publishing happened.",
  };

  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: manualPublicationAction,
        messageAr: "تم تسجيل نشر محتوى يدوي",
        messageEn: "Manual content publication recorded",
        entityType: "ContentPublication",
        entityId: publication.id,
        metadata: {
          contentPublication: publication,
          contentItem,
          externalCall: false,
          autoPublish: false,
          autoSend: false,
          providerCall: false,
          humanConfirmed: true,
        },
        stream: "TEAM",
      },
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 200, message: "Manual publication recorded.", data: publication };
  } catch (error) {
    console.error("Content publication save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Content publication save failed." };
  }
}
