import { prisma } from "@/lib/prisma";
import { messagingCampaigns, messagingTemplates } from "./messaging-data";
import type { MessagingCampaign, MessagingOverview, MessagingTemplate } from "./messaging-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const saveAction = "operations.messaging.save";
const removeAction = "operations.messaging.remove";
const messagingActions = [saveAction, removeAction];

type MessagingKind = "template" | "campaign";
type MessagingActor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
type MessagingItem = MessagingTemplate | MessagingCampaign;
type StoredMessagingEntry = { kind: MessagingKind; id: string; item: MessagingItem; deleted: boolean };

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isKind(value: unknown): value is MessagingKind {
  return value === "template" || value === "campaign";
}

function itemId(item: Record<string, unknown>) {
  return stringField(item.id) ?? stringField(item.title);
}

function storedEntryFromMetadata(metadata: unknown): StoredMessagingEntry | null {
  const root = metadataObject(metadata);
  const kind = root.kind;
  const item = metadataObject(root.item);
  const id = stringField(root.id) ?? itemId(item);
  if (!id || !isKind(kind)) return null;
  return { kind, id, item: { ...item, id } as MessagingItem, deleted: root.deleted === true };
}

async function readStoredEntries(kind: MessagingKind): Promise<StoredMessagingEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "OperationsMessagingItem", action: { in: messagingActions } },
      orderBy: { createdAt: "desc" },
      take: 700,
      select: { metadata: true },
    });
    const latest = new Map<string, StoredMessagingEntry>();
    for (const row of rows) {
      const parsed = storedEntryFromMetadata(row.metadata);
      if (!parsed || parsed.kind !== kind) continue;
      if (!latest.has(parsed.id)) latest.set(parsed.id, parsed);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Messaging audit read failed", error);
    return [];
  }
}

function mergeItems<T extends { id: string }>(fallback: T[], entries: StoredMessagingEntry[]): T[] {
  const deletedIds = new Set(entries.filter((entry) => entry.deleted).map((entry) => entry.id));
  const saved = entries.filter((entry) => !entry.deleted).map((entry) => entry.item as T);
  const savedIds = new Set(saved.map((item) => item.id));
  const untouched = fallback.filter((item) => !deletedIds.has(item.id) && !savedIds.has(item.id));
  return [...saved, ...untouched];
}

async function writeMessagingRecord(params: { kind: MessagingKind; item: MessagingItem; deleted?: boolean; actor?: MessagingActor | null }) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not configured; messaging item was not saved." };
  }
  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(params.actor?.actorId),
        actorName: params.actor?.actorName ?? undefined,
        actorRole: params.actor?.actorRole || "ADMIN",
        action: params.deleted ? removeAction : saveAction,
        messageAr: params.deleted ? "تم حذف عنصر من مركز الرسائل" : "تم حفظ عنصر في مركز الرسائل",
        messageEn: params.deleted ? "Messaging item removed" : "Messaging item saved",
        entityType: "OperationsMessagingItem",
        entityId: `${params.kind}:${params.item.id}`,
        metadata: {
          kind: params.kind,
          id: params.item.id,
          item: params.item,
          deleted: params.deleted === true,
          externalCall: false,
          autoSend: false,
          humanReviewRequired: true,
          provider: "manual-only",
        },
        stream: "TEAM",
      },
    });
    return { ok: true, status: 200, message: params.deleted ? "Messaging item removed." : "Messaging item saved.", data: params.item };
  } catch (error) {
    console.error("Messaging audit write failed", error);
    return { ok: false, status: 503, message: "Messaging item save failed." };
  }
}

export async function listMessagingTemplates(): Promise<MessagingTemplate[]> {
  return mergeItems(messagingTemplates, await readStoredEntries("template"));
}

export async function listMessagingCampaigns(): Promise<MessagingCampaign[]> {
  return mergeItems(messagingCampaigns, await readStoredEntries("campaign"));
}

export async function getMessagingOverview(): Promise<MessagingOverview> {
  const [templates, campaigns] = await Promise.all([listMessagingTemplates(), listMessagingCampaigns()]);
  return {
    generatedAt: new Date().toISOString(),
    templates,
    campaigns,
    summary: {
      templates: templates.length,
      campaigns: campaigns.length,
      needsReview: templates.filter((item) => item.status === "NEEDS_REVIEW").length + campaigns.filter((item) => item.status === "READY_FOR_REVIEW").length,
      approved: templates.filter((item) => item.status === "APPROVED").length + campaigns.filter((item) => item.status === "APPROVED").length,
      scheduled: campaigns.filter((item) => item.status === "SCHEDULED").length,
      manualSent: campaigns.filter((item) => item.status === "MANUAL_SENT").length,
    },
    safety: {
      externalSideEffects: false,
      autoSend: false,
      humanReviewRequired: true,
      note: "مركز الرسائل يحفظ القوالب والجدولة داخليًا فقط ولا يرسل أي واتساب أو إيميل تلقائيًا.",
    },
  };
}

export function normalizeTemplate(input: Record<string, unknown>): MessagingTemplate {
  return {
    id: stringField(input.id) ?? `msg_tpl_${Date.now()}`,
    title: stringField(input.title) ?? "قالب رسالة جديد",
    channel: (stringField(input.channel) as MessagingTemplate["channel"]) || "WHATSAPP",
    category: stringField(input.category) ?? "عام",
    language: stringField(input.language) ?? "Turkish",
    body: stringField(input.body) ?? "",
    cta: stringField(input.cta),
    variables: Array.isArray(input.variables) ? input.variables.map(String) : [],
    status: (stringField(input.status) as MessagingTemplate["status"]) || "DRAFT",
    owner: stringField(input.owner),
    notes: stringField(input.notes),
  };
}

export function normalizeCampaign(input: Record<string, unknown>): MessagingCampaign {
  return {
    id: stringField(input.id) ?? `msg_campaign_${Date.now()}`,
    title: stringField(input.title) ?? "حملة رسائل جديدة",
    channel: (stringField(input.channel) as MessagingCampaign["channel"]) || "WHATSAPP",
    objective: stringField(input.objective) ?? "متابعة المتبرعين",
    audience: stringField(input.audience) ?? "غير محدد",
    templateId: stringField(input.templateId),
    scheduledAt: stringField(input.scheduledAt),
    status: (stringField(input.status) as MessagingCampaign["status"]) || "PLANNING",
    owner: stringField(input.owner),
    notes: stringField(input.notes),
    lastManualStatus: stringField(input.lastManualStatus),
    lastManualAt: stringField(input.lastManualAt),
  };
}

export async function saveMessagingItem(kind: MessagingKind, item: MessagingItem, actor?: MessagingActor | null) {
  return writeMessagingRecord({ kind, item, actor });
}

export async function removeMessagingItem(kind: MessagingKind, item: MessagingItem, actor?: MessagingActor | null) {
  return writeMessagingRecord({ kind, item, deleted: true, actor });
}
