import { getOperationsOverview } from "../service";
import type { OperationsContentItem } from "../types";
import { getWorkScore, getWorkSummary } from "./work-progress";
import type { WorkFormat, WorkItem, WorkLanguage, WorkSnapshot, WorkStatus, WorkTheme } from "./registry-types";

function asFormat(value: string): WorkFormat {
  const normalized = value.toUpperCase();
  if (["VIDEO", "DESIGN", "CAROUSEL", "STORY", "EMAIL", "MESSAGE", "PAGE_COPY"].includes(normalized)) return normalized as WorkFormat;
  return "DESIGN";
}

function asStatus(value: string): WorkStatus {
  const normalized = value.toUpperCase();
  if (normalized === "WRITING") return "COPY";
  if (normalized === "DESIGN") return "ASSET";
  if (normalized === "RESULTS_ADDED") return "MEASURED";
  if (["IDEA", "COPY", "ASSET", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "MEASURED", "ARCHIVED"].includes(normalized)) return normalized as WorkStatus;
  return "IDEA";
}

function asTheme(item: OperationsContentItem): WorkTheme {
  const text = `${item.title} ${item.channel}`.toUpperCase();
  if (text.includes("GAZA") || text.includes("غزة")) return "GAZA";
  if (text.includes("WAQF") || text.includes("وقف")) return "WAQF";
  if (text.includes("ZAKAT") || text.includes("زكاة")) return "ZAKAT";
  if (text.includes("QUDS") || text.includes("قدس")) return "AL_QUDS";
  if (text.includes("FRIDAY") || text.includes("جمعة")) return "FRIDAY";
  if (text.includes("RAMADAN") || text.includes("رمضان")) return "RAMADAN";
  return "GENERAL";
}

function toWorkItem(item: OperationsContentItem, index: number): WorkItem {
  const status = asStatus(item.status);
  const work: WorkItem = {
    id: item.id || `work-${index + 1}`,
    code: item.id || `WORK-${String(index + 1).padStart(3, "0")}`,
    title: item.title,
    theme: asTheme(item),
    format: asFormat(item.type),
    language: "ar" as WorkLanguage,
    status,
    owner: null,
    dueAt: item.due || null,
    publishAt: item.lastPublishedAt || null,
    assetUrl: null,
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: item.lastPublishedAt || new Date().toISOString(),
  };
  return { ...work, progress: getWorkScore(work) };
}

export async function getWorkRegistrySnapshot(): Promise<WorkSnapshot> {
  const overview = await getOperationsOverview();
  const items = overview.items.map(toWorkItem);
  return {
    generatedAt: new Date().toISOString(),
    summary: getWorkSummary(items),
    items,
  };
}
