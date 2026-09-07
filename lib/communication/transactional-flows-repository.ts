import { prisma } from "@/lib/prisma";
import { foundationTransactionalFlows } from "./transactional-flows-data";
import type { TransactionalFlow } from "./communication-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const saveAction = "communication.transactional-flow.save";
const removeAction = "communication.transactional-flow.remove";
const flowActions = [saveAction, removeAction];

type FlowActor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
type StoredFlowEntry = { id: string; item: TransactionalFlow; deleted: boolean };

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStep(input: Record<string, unknown>, index: number): TransactionalFlow["steps"][number] {
  return {
    id: stringField(input.id) ?? `flow_step_${Date.now()}_${index}`,
    channel: (stringField(input.channel) as TransactionalFlow["steps"][number]["channel"]) || "EMAIL",
    providerKey: (stringField(input.providerKey) as TransactionalFlow["steps"][number]["providerKey"]) || "ELASTIC_EMAIL",
    templateId: stringField(input.templateId) ?? "template_pending",
    delayMinutes: numberField(input.delayMinutes, 0),
    requiresConsent: booleanField(input.requiresConsent, true),
    fallbackProviderKey: (stringField(input.fallbackProviderKey) as TransactionalFlow["steps"][number]["fallbackProviderKey"]) || null,
  };
}

export function normalizeTransactionalFlow(input: Record<string, unknown>): TransactionalFlow {
  const steps = Array.isArray(input.steps) ? input.steps.map((step, index) => normalizeStep(metadataObject(step), index)) : [];
  return {
    id: stringField(input.id) ?? `flow_${Date.now()}`,
    eventKey: stringField(input.eventKey) ?? "custom.event",
    title: stringField(input.title) ?? "تدفق تشغيلي جديد",
    status: (stringField(input.status) as TransactionalFlow["status"]) || "DRAFT",
    steps,
  };
}

function storedEntryFromMetadata(metadata: unknown): StoredFlowEntry | null {
  const root = metadataObject(metadata);
  const item = metadataObject(root.item);
  const id = stringField(root.id) ?? stringField(item.id);
  if (!id) return null;
  return { id, item: normalizeTransactionalFlow({ ...item, id }), deleted: root.deleted === true };
}

async function readStoredEntries(): Promise<StoredFlowEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CommunicationTransactionalFlow", action: { in: flowActions } },
      orderBy: { createdAt: "desc" },
      take: 700,
      select: { metadata: true },
    });
    const latest = new Map<string, StoredFlowEntry>();
    for (const row of rows) {
      const parsed = storedEntryFromMetadata(row.metadata);
      if (!parsed) continue;
      if (!latest.has(parsed.id)) latest.set(parsed.id, parsed);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Transactional flows audit read failed", error);
    return [];
  }
}

function mergeFlows(fallback: TransactionalFlow[], entries: StoredFlowEntry[]) {
  const deletedIds = new Set(entries.filter((entry) => entry.deleted).map((entry) => entry.id));
  const saved = entries.filter((entry) => !entry.deleted).map((entry) => entry.item);
  const savedIds = new Set(saved.map((item) => item.id));
  const untouched = fallback.filter((item) => !deletedIds.has(item.id) && !savedIds.has(item.id));
  return [...saved, ...untouched];
}

async function writeFlowRecord(params: { item: TransactionalFlow; deleted?: boolean; actor?: FlowActor | null }) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not configured; flow was not saved." };
  }
  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(params.actor?.actorId),
        actorName: params.actor?.actorName ?? undefined,
        actorRole: params.actor?.actorRole || "ADMIN",
        action: params.deleted ? removeAction : saveAction,
        messageAr: params.deleted ? "تم حذف تدفق تواصل تشغيلي" : "تم حفظ تدفق تواصل تشغيلي",
        messageEn: params.deleted ? "Transactional flow removed" : "Transactional flow saved",
        entityType: "CommunicationTransactionalFlow",
        entityId: params.item.id,
        metadata: { id: params.item.id, item: params.item, deleted: params.deleted === true, externalCall: false, autoExecute: false, simulationOnly: true },
        stream: "TEAM",
      },
    });
    return { ok: true, status: 200, message: params.deleted ? "Flow removed." : "Flow saved.", data: params.item };
  } catch (error) {
    console.error("Transactional flows audit write failed", error);
    return { ok: false, status: 503, message: "Flow save failed." };
  }
}

export async function listTransactionalFlows(): Promise<TransactionalFlow[]> {
  return mergeFlows(foundationTransactionalFlows, await readStoredEntries());
}

export async function getTransactionalFlowsOverview() {
  const flows = await listTransactionalFlows();
  return {
    generatedAt: new Date().toISOString(),
    flows,
    summary: {
      flows: flows.length,
      active: flows.filter((flow) => flow.status === "ACTIVE").length,
      draft: flows.filter((flow) => flow.status === "DRAFT").length,
      paused: flows.filter((flow) => flow.status === "PAUSED").length,
      steps: flows.reduce((total, flow) => total + flow.steps.length, 0),
    },
    safety: {
      externalSideEffects: false,
      autoExecute: false,
      simulationOnly: true,
      note: "التدفقات التشغيلية هنا محاكاة داخلية فقط ولا تنفذ أي إرسال أو اتصال بمزود.",
    },
  };
}

export async function saveTransactionalFlow(item: TransactionalFlow, actor?: FlowActor | null) {
  return writeFlowRecord({ item, actor });
}

export async function removeTransactionalFlow(item: TransactionalFlow, actor?: FlowActor | null) {
  return writeFlowRecord({ item, deleted: true, actor });
}
