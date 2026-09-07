import { prisma } from "@/lib/prisma";

const objectIdPattern = /^[a-f\d]{24}$/i;
const updateAction = "operations.foundation-item.update";
const removeAction = "operations.foundation-item.remove";
const foundationActions = [updateAction, removeAction];

export const foundationCollections = ["seasons", "weeklyThemes", "plans", "tasks"] as const;
export type FoundationCollection = (typeof foundationCollections)[number];

type FoundationActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

type FoundationRecord = {
  id?: string;
  title?: string;
};

type FoundationRecordPayload = Record<string, unknown> & FoundationRecord;

type StoredFoundationEntry<T extends FoundationRecord> = {
  id: string;
  collection: FoundationCollection;
  item: T;
  deleted: boolean;
  metadata: Record<string, unknown>;
};

export type FoundationOverrideState<T extends FoundationRecord> = {
  items: T[];
  deletedIds: string[];
};

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordObject<T extends FoundationRecord>(value: T) {
  return value as FoundationRecordPayload;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isFoundationCollection(value: unknown): value is FoundationCollection {
  return foundationCollections.includes(value as FoundationCollection);
}

function itemId(item: FoundationRecord) {
  const record = recordObject(item);
  return stringField(record.id) ?? stringField(record.title);
}

function storedEntryFromMetadata<T extends FoundationRecord>(metadata: unknown): StoredFoundationEntry<T> | null {
  const root = metadataObject(metadata);
  const collection = root.collection;
  const item = metadataObject(root.item) as T;
  const id = stringField(root.id) ?? itemId(item);
  if (!id || !isFoundationCollection(collection)) return null;

  return {
    id,
    collection,
    item: { ...recordObject(item), id } as T,
    deleted: root.deleted === true,
    metadata: root,
  };
}

async function readStoredFoundationEntries<T extends FoundationRecord>(collection: FoundationCollection): Promise<StoredFoundationEntry<T>[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "OperationsFoundationItem", action: { in: foundationActions } },
      orderBy: { createdAt: "desc" },
      take: 800,
      select: { id: true, metadata: true },
    });

    const latest = new Map<string, StoredFoundationEntry<T>>();
    for (const row of rows) {
      const parsed = storedEntryFromMetadata<T>(row.metadata);
      if (!parsed || parsed.collection !== collection) continue;
      if (!latest.has(parsed.id)) latest.set(parsed.id, parsed);
    }

    return [...latest.values()];
  } catch (error) {
    console.error("Operations foundation override read failed", error);
    return [];
  }
}

export async function readFoundationOverrideState<T extends FoundationRecord>(collection: FoundationCollection): Promise<FoundationOverrideState<T>> {
  const entries = await readStoredFoundationEntries<T>(collection);
  return {
    items: entries.filter((entry) => !entry.deleted).map((entry) => entry.item),
    deletedIds: entries.filter((entry) => entry.deleted).map((entry) => entry.id),
  };
}

export function mergeFoundationRecords<T extends FoundationRecord>(fallbackItems: T[], overrideState: FoundationOverrideState<T>): T[] {
  const deletedIds = new Set(overrideState.deletedIds);
  const overrideIds = new Set(overrideState.items.map((item) => itemId(item)).filter(Boolean) as string[]);
  const untouchedFallback = fallbackItems.filter((item) => {
    const id = itemId(item);
    if (!id) return true;
    return !deletedIds.has(id) && !overrideIds.has(id);
  });

  return [...overrideState.items, ...untouchedFallback];
}

async function writeFoundationRecord(params: {
  action: string;
  collection: FoundationCollection;
  item: FoundationRecord;
  deleted?: boolean;
  actor?: FoundationActor | null;
}) {
  const id = itemId(params.item);
  if (!id) throw new Error("Foundation item id is required.");

  await prisma.auditLog.create({
    data: {
      actorId: safeObjectId(params.actor?.actorId),
      actorName: params.actor?.actorName ?? undefined,
      actorRole: params.actor?.actorRole || "ADMIN",
      action: params.action,
      messageAr: params.deleted ? "تم حذف عنصر من بيانات العمليات" : "تم تعديل عنصر من بيانات العمليات",
      messageEn: params.deleted ? "Operations foundation item removed" : "Operations foundation item updated",
      entityType: "OperationsFoundationItem",
      entityId: `${params.collection}:${id}`,
      metadata: {
        collection: params.collection,
        id,
        item: { ...recordObject(params.item), id },
        deleted: params.deleted === true,
        externalCall: false,
        autoPublish: false,
        autoSend: false,
        humanReviewRequired: true,
      },
      stream: "TEAM",
    },
  });
}

export async function saveFoundationRecordOverride(params: {
  collection: FoundationCollection;
  item: FoundationRecord;
  actor?: FoundationActor | null;
}) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not configured; item was not saved." };
  }

  try {
    await writeFoundationRecord({ action: updateAction, collection: params.collection, item: params.item, actor: params.actor });
    return { ok: true, status: 200, message: "Operations item saved.", data: params.item };
  } catch (error) {
    console.error("Operations foundation override save failed", error);
    return { ok: false, status: 503, message: "Operations item save failed." };
  }
}

export async function removeFoundationRecordOverride(params: {
  collection: FoundationCollection;
  item: FoundationRecord;
  actor?: FoundationActor | null;
}) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not configured; item was not removed." };
  }

  try {
    await writeFoundationRecord({ action: removeAction, collection: params.collection, item: params.item, deleted: true, actor: params.actor });
    return { ok: true, status: 200, message: "Operations item removed.", data: params.item };
  } catch (error) {
    console.error("Operations foundation override remove failed", error);
    return { ok: false, status: 503, message: "Operations item remove failed." };
  }
}
