import { prisma } from "@/lib/prisma";
import { marketingPerformanceRecords } from "./performance-data";
import type { MarketingPerformanceOverview, MarketingPerformanceRecord } from "./performance-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const saveAction = "operations.marketing-performance.save";
const removeAction = "operations.marketing-performance.remove";
const actions = [saveAction, removeAction];

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
type StoredEntry = { id: string; item: MarketingPerformanceRecord; deleted: boolean };

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function storedEntryFromMetadata(metadata: unknown): StoredEntry | null {
  const root = metadataObject(metadata);
  const item = metadataObject(root.item);
  const id = stringField(root.id) ?? stringField(item.id);
  if (!id) return null;
  return { id, item: normalizePerformanceRecord({ ...item, id }), deleted: root.deleted === true };
}

async function readStoredEntries(): Promise<StoredEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "OperationsMarketingPerformance", action: { in: actions } },
      orderBy: { createdAt: "desc" },
      take: 700,
      select: { metadata: true },
    });
    const latest = new Map<string, StoredEntry>();
    for (const row of rows) {
      const parsed = storedEntryFromMetadata(row.metadata);
      if (parsed && !latest.has(parsed.id)) latest.set(parsed.id, parsed);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Marketing performance read failed", error);
    return [];
  }
}

function mergeRecords(fallback: MarketingPerformanceRecord[], entries: StoredEntry[]) {
  const deletedIds = new Set(entries.filter((entry) => entry.deleted).map((entry) => entry.id));
  const saved = entries.filter((entry) => !entry.deleted).map((entry) => entry.item);
  const savedIds = new Set(saved.map((item) => item.id));
  return [...saved, ...fallback.filter((item) => !deletedIds.has(item.id) && !savedIds.has(item.id))];
}

export function normalizePerformanceRecord(input: Record<string, unknown>): MarketingPerformanceRecord {
  return {
    id: stringField(input.id) ?? `perf_${Date.now()}`,
    title: stringField(input.title) ?? "سجل أداء جديد",
    contentItemId: stringField(input.contentItemId),
    platform: (stringField(input.platform) as MarketingPerformanceRecord["platform"]) || "META",
    campaignName: stringField(input.campaignName) ?? "حملة غير مسماة",
    period: stringField(input.period) ?? "غير محدد",
    spend: numberField(input.spend),
    donations: numberField(input.donations),
    donationValue: numberField(input.donationValue),
    clicks: numberField(input.clicks),
    impressions: numberField(input.impressions),
    conversions: numberField(input.conversions),
    status: (stringField(input.status) as MarketingPerformanceRecord["status"]) || "DRAFT",
    owner: stringField(input.owner),
    notes: stringField(input.notes),
  };
}

export async function listMarketingPerformanceRecords() {
  return mergeRecords(marketingPerformanceRecords, await readStoredEntries());
}

export async function getMarketingPerformanceOverview(): Promise<MarketingPerformanceOverview> {
  const records = await listMarketingPerformanceRecords();
  const spend = records.reduce((sum, item) => sum + item.spend, 0);
  const donations = records.reduce((sum, item) => sum + item.donations, 0);
  const donationValue = records.reduce((sum, item) => sum + item.donationValue, 0);
  const clicks = records.reduce((sum, item) => sum + item.clicks, 0);
  const impressions = records.reduce((sum, item) => sum + item.impressions, 0);
  const conversions = records.reduce((sum, item) => sum + item.conversions, 0);
  return {
    generatedAt: new Date().toISOString(),
    records,
    summary: {
      records: records.length,
      spend,
      donations,
      donationValue,
      clicks,
      impressions,
      conversions,
      averageCpa: conversions ? Math.round(spend / conversions) : 0,
      roas: spend ? Math.round((donationValue / spend) * 100) / 100 : 0,
    },
    safety: {
      externalSideEffects: false,
      autoBudgetChange: false,
      humanReviewRequired: true,
      note: "البيانات هنا للقياس واتخاذ القرار فقط، ولا تغير ميزانيات أو حملات المنصات تلقائيًا.",
    },
  };
}

async function writeRecord(item: MarketingPerformanceRecord, deleted: boolean, actor?: Actor | null) {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, message: "DATABASE_URL is not configured; performance record was not saved." };
  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: deleted ? removeAction : saveAction,
        messageAr: deleted ? "تم حذف سجل أداء تسويقي" : "تم حفظ سجل أداء تسويقي",
        messageEn: deleted ? "Marketing performance record removed" : "Marketing performance record saved",
        entityType: "OperationsMarketingPerformance",
        entityId: item.id,
        metadata: { id: item.id, item, deleted, externalCall: false, autoBudgetChange: false, humanReviewRequired: true },
        stream: "TEAM",
      },
    });
    return { ok: true, status: 200, message: deleted ? "Performance record removed." : "Performance record saved.", data: item };
  } catch (error) {
    console.error("Marketing performance write failed", error);
    return { ok: false, status: 503, message: "Performance record save failed." };
  }
}

export async function saveMarketingPerformanceRecord(item: MarketingPerformanceRecord, actor?: Actor | null) {
  return writeRecord(item, false, actor);
}

export async function removeMarketingPerformanceRecord(item: MarketingPerformanceRecord, actor?: Actor | null) {
  return writeRecord(item, true, actor);
}
