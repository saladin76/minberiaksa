import { prisma } from "@/lib/prisma";
import type { ArchiveAsset } from "@/lib/archive/archive-types";
import type { OperationsContentItem } from "./types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const archiveContentItemAction = "operations.content-item.create-from-archive-asset";
const manualContentItemCreateAction = "operations.content-item.manual-create";
const manualContentItemUpdateAction = "operations.content-item.manual-update";
const manualContentItemDeleteAction = "operations.content-item.manual-delete";
const contentItemActions = [archiveContentItemAction, manualContentItemCreateAction, manualContentItemUpdateAction, manualContentItemDeleteAction];
const allowedStatuses = new Set(["IDEA", "WRITING", "DESIGN", "REVIEW", "APPROVED", "COPY_NEEDED", "COPY_READY", "SCHEDULED", "PUBLISHED"]);
const detailKeys = ["owner", "language", "theme", "hook", "cta", "copy", "figmaUrl", "driveUrl", "videoUrl", "finalAssetUrl", "campaignLinkId", "adId"] as const;

type DetailKey = (typeof detailKeys)[number];

export type ContentItemProposalActor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

export type ContentItemWriteInput = {
  id?: string | null;
  title?: string | null;
  type?: string | null;
  format?: string | null;
  status?: string | null;
  channel?: string | null;
  due?: string | null;
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
  sourceType?: string | null;
  sourceAssetId?: string | null;
  sourceProjectId?: string | null;
  previewUrl?: string | null;
  notes?: string | null;
};

export type ContentItemProposalResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: OperationsContentItem;
};

type StoredContentItemEntry = { item: OperationsContentItem; sourceAssetId: string | null; sourceProjectId: string | null; deleted: boolean; metadata: Record<string, unknown> };
export type AuditBackedContentItemState = { items: OperationsContentItem[]; deletedIds: string[] };

function safeObjectId(value: string | null | undefined) { return value && objectIdPattern.test(value) ? value : undefined; }
function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}; }
function stringField(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function sanitizeStatus(value: unknown, fallback = "IDEA") { const status = stringField(value)?.toUpperCase(); return status && allowedStatuses.has(status) ? status : fallback; }
function addDays(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function generatedContentItemId() { return `content_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function detailFromRecord(record: Record<string, unknown>, key: DetailKey) { return stringField(record[key]); }
function detailFromInput(input: ContentItemWriteInput, key: DetailKey, base?: OperationsContentItem) {
  return Object.prototype.hasOwnProperty.call(input, key) ? stringField(input[key]) : base?.[key] ?? null;
}
function contentDetailsFromInput(input: ContentItemWriteInput, base?: OperationsContentItem): Partial<OperationsContentItem> {
  return detailKeys.reduce<Partial<OperationsContentItem>>((details, key) => {
    details[key] = detailFromInput(input, key, base);
    return details;
  }, {});
}
function contentDetailsFromRecord(record: Record<string, unknown>): Partial<OperationsContentItem> {
  return detailKeys.reduce<Partial<OperationsContentItem>>((details, key) => {
    details[key] = detailFromRecord(record, key);
    return details;
  }, {});
}

function contentTypeForAsset(asset: ArchiveAsset) {
  if (asset.recommendedUse === "REEL") return "REEL";
  if (asset.recommendedUse === "CAROUSEL") return "CAROUSEL";
  if (asset.recommendedUse === "WHATSAPP") return "WHATSAPP";
  if (asset.recommendedUse === "SEO_ARTICLE") return "SEO_ARTICLE";
  if (asset.recommendedUse === "REPORT") return "REPORT";
  if (asset.fileType === "VIDEO") return "VIDEO";
  if (asset.fileType === "DOCUMENT") return "REPORT";
  return "DESIGN";
}

function channelForAsset(asset: ArchiveAsset) {
  if (asset.recommendedUse === "WHATSAPP") return "WhatsApp";
  if (asset.recommendedUse === "SEO_ARTICLE" || asset.recommendedUse === "REPORT") return "Website";
  if (asset.recommendedUse === "ADS") return "Meta Ads";
  if (asset.recommendedUse === "REEL") return "Instagram / TikTok";
  return "Social";
}

function titleForAsset(asset: ArchiveAsset) { return asset.fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || asset.fileName; }

function buildContentItemFromAsset(asset: ArchiveAsset): OperationsContentItem {
  return {
    id: generatedContentItemId(),
    title: titleForAsset(asset),
    type: contentTypeForAsset(asset),
    status: asset.marketingApproved ? "APPROVED" : "IDEA",
    channel: channelForAsset(asset),
    due: addDays(asset.marketingApproved ? 3 : 7),
    driveUrl: asset.webViewLink,
    finalAssetUrl: asset.previewUrl,
  };
}

function buildManualContentItem(input: ContentItemWriteInput): OperationsContentItem {
  const title = stringField(input.title) ?? "New content item";
  const type = stringField(input.type) ?? stringField(input.format) ?? "DESIGN";
  return {
    id: stringField(input.id) ?? generatedContentItemId(),
    title,
    type: type.toUpperCase(),
    status: sanitizeStatus(input.status, type.toUpperCase() === "SEO_ARTICLE" ? "WRITING" : "IDEA"),
    channel: stringField(input.channel) ?? "Social",
    due: stringField(input.due) ?? addDays(7),
    ...contentDetailsFromInput(input),
  };
}

function contentItemFromMetadata(metadata: unknown): StoredContentItemEntry | null {
  const root = metadataObject(metadata);
  const contentItem = metadataObject(root.contentItem);
  const id = stringField(contentItem.id);
  const title = stringField(contentItem.title);
  if (!id || !title) return null;

  return {
    item: {
      id,
      title,
      type: stringField(contentItem.type) ?? "DESIGN",
      status: sanitizeStatus(contentItem.status),
      channel: stringField(contentItem.channel) ?? "Social",
      due: stringField(contentItem.due) ?? "to be scheduled",
      ...contentDetailsFromRecord(contentItem),
    },
    sourceAssetId: stringField(root.sourceAssetId),
    sourceProjectId: stringField(root.sourceProjectId),
    deleted: root.deleted === true,
    metadata: root,
  };
}

async function readStoredContentItemEntries(): Promise<StoredContentItemEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "ContentItem", action: { in: contentItemActions } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, metadata: true },
    });
    const latest = new Map<string, StoredContentItemEntry>();
    for (const row of rows) {
      const parsed = contentItemFromMetadata(row.metadata);
      if (!parsed) continue;
      const dedupeKey = parsed.sourceAssetId ? `archive:${parsed.sourceAssetId}` : parsed.item.id ?? row.id;
      if (!latest.has(dedupeKey)) latest.set(dedupeKey, parsed);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Audit-backed content item read failed", error);
    return [];
  }
}

export async function readAuditBackedContentItemState(): Promise<AuditBackedContentItemState> {
  const entries = await readStoredContentItemEntries();
  return { items: entries.filter((entry) => !entry.deleted).map((entry) => entry.item), deletedIds: entries.filter((entry) => entry.deleted).map((entry) => entry.item.id).filter(Boolean) as string[] };
}
export async function readAuditBackedContentItems(): Promise<OperationsContentItem[]> { const state = await readAuditBackedContentItemState(); return state.items; }

async function writeContentItemAuditRecord(params: { action: string; messageAr: string; messageEn: string; contentItem: OperationsContentItem; actor?: ContentItemProposalActor | null; metadata?: Record<string, unknown> }) {
  await prisma.auditLog.create({
    data: {
      actorId: safeObjectId(params.actor?.actorId),
      actorName: params.actor?.actorName ?? undefined,
      actorRole: params.actor?.actorRole || "ADMIN",
      action: params.action,
      messageAr: params.messageAr,
      messageEn: params.messageEn,
      entityType: "ContentItem",
      entityId: params.contentItem.id,
      metadata: { contentItem: params.contentItem, externalCall: false, autoPublish: false, autoSend: false, aiGenerated: false, humanReviewRequired: true, ...params.metadata },
      stream: "TEAM",
    },
  });
}

export async function createAuditBackedContentItem(input: ContentItemWriteInput, actor?: ContentItemProposalActor | null): Promise<ContentItemProposalResult> {
  if (!process.env.DATABASE_URL) return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; content item was not saved." };
  const contentItem = buildManualContentItem(input);
  try {
    await writeContentItemAuditRecord({
      action: manualContentItemCreateAction,
      messageAr: "تم إنشاء عنصر محتوى يدوي",
      messageEn: "Manual content item created",
      contentItem,
      actor,
      metadata: { sourceType: stringField(input.sourceType) ?? "MANUAL", sourceAssetId: stringField(input.sourceAssetId), sourceProjectId: stringField(input.sourceProjectId), previewUrl: stringField(input.previewUrl), notes: stringField(input.notes) },
    });
    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Content item saved.", data: contentItem };
  } catch (error) {
    console.error("Content item save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Content item save failed." };
  }
}

export async function updateAuditBackedContentItem(input: ContentItemWriteInput, actor?: ContentItemProposalActor | null): Promise<ContentItemProposalResult> {
  const id = stringField(input.id);
  if (!id) return { ok: false, mode: "foundation", externalCall: false, status: 400, message: "Content item id is required." };
  if (!process.env.DATABASE_URL) return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; content item was not updated." };

  const entries = await readStoredContentItemEntries();
  const existing = entries.find((entry) => entry.item.id === id && !entry.deleted);
  if (!existing && !stringField(input.title)) return { ok: false, mode: "prisma", externalCall: false, status: 404, message: "Content item not found." };

  const base = existing?.item ?? buildManualContentItem({ ...input, id });
  const contentItem: OperationsContentItem = {
    ...base,
    title: stringField(input.title) ?? base.title,
    type: (stringField(input.type) ?? stringField(input.format) ?? base.type).toUpperCase(),
    status: input.status ? sanitizeStatus(input.status, base.status) : base.status,
    channel: stringField(input.channel) ?? base.channel,
    due: stringField(input.due) ?? base.due,
    ...contentDetailsFromInput(input, base),
  };

  try {
    await writeContentItemAuditRecord({
      action: manualContentItemUpdateAction,
      messageAr: "تم تحديث عنصر محتوى",
      messageEn: "Content item updated",
      contentItem,
      actor,
      metadata: { ...(existing?.metadata ?? {}), sourceAssetId: existing?.sourceAssetId ?? stringField(input.sourceAssetId), sourceProjectId: existing?.sourceProjectId ?? stringField(input.sourceProjectId), sourceType: existing ? stringField(existing.metadata.sourceType) : "MANUAL_OVERRIDE", notes: stringField(input.notes) ?? stringField(existing?.metadata.notes) },
    });
    return { ok: true, mode: "prisma", externalCall: false, status: 200, message: "Content item updated.", data: contentItem };
  } catch (error) {
    console.error("Content item update failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Content item update failed." };
  }
}

export async function deleteAuditBackedContentItem(input: ContentItemWriteInput, actor?: ContentItemProposalActor | null): Promise<ContentItemProposalResult> {
  const id = stringField(input.id);
  if (!id) return { ok: false, mode: "foundation", externalCall: false, status: 400, message: "Content item id is required." };
  if (!process.env.DATABASE_URL) return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; content item was not removed." };

  const entries = await readStoredContentItemEntries();
  const existing = entries.find((entry) => entry.item.id === id && !entry.deleted);
  const contentItem: OperationsContentItem = existing?.item ?? { id, title: stringField(input.title) ?? id, type: stringField(input.type) ?? "DESIGN", status: sanitizeStatus(input.status), channel: stringField(input.channel) ?? "Social", due: stringField(input.due) ?? "غير محدد", ...contentDetailsFromInput(input) };

  try {
    await writeContentItemAuditRecord({
      action: manualContentItemDeleteAction,
      messageAr: "تم حذف عنصر محتوى من لوحة العمليات",
      messageEn: "Content item removed from operations board",
      contentItem,
      actor,
      metadata: { ...(existing?.metadata ?? {}), deleted: true, sourceType: stringField(existing?.metadata.sourceType) ?? "MANUAL_REMOVE" },
    });
    return { ok: true, mode: "prisma", externalCall: false, status: 200, message: "Content item removed.", data: contentItem };
  } catch (error) {
    console.error("Content item delete failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Content item delete failed." };
  }
}

export async function persistContentItemProposalFromArchiveAsset(asset: ArchiveAsset, actor?: ContentItemProposalActor | null): Promise<ContentItemProposalResult> {
  if (asset.humanReviewStatus === "REJECTED") return { ok: false, mode: "foundation", externalCall: false, status: 409, message: "Rejected archive assets cannot create content items." };
  if (!process.env.DATABASE_URL) return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; content item proposal was not saved." };

  const contentItem = buildContentItemFromAsset(asset);
  try {
    await writeContentItemAuditRecord({
      action: archiveContentItemAction,
      messageAr: "تم إنشاء عنصر محتوى من أصل أرشيف",
      messageEn: "Content item proposal created from archive asset",
      contentItem,
      actor,
      metadata: { sourceType: "ARCHIVE_ASSET", sourceAssetId: asset.id, sourceProjectId: asset.projectId, driveUrl: asset.webViewLink, previewUrl: asset.previewUrl, fileName: asset.fileName, recommendedUse: asset.recommendedUse, humanReviewStatus: asset.humanReviewStatus, marketingApproved: asset.marketingApproved, documentationApproved: asset.documentationApproved },
    });
    return { ok: true, mode: "prisma", externalCall: false, status: 200, message: "Content item proposal saved from archive asset.", data: contentItem };
  } catch (error) {
    console.error("Content item proposal save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Content item proposal save failed." };
  }
}
