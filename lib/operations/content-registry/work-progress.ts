import type { WorkItem, WorkStatus, WorkSummary } from "./registry-types";

const score: Record<WorkStatus, number> = {
  IDEA: 10,
  COPY: 25,
  ASSET: 50,
  REVIEW: 65,
  APPROVED: 80,
  SCHEDULED: 88,
  PUBLISHED: 95,
  MEASURED: 100,
  ARCHIVED: 100,
};

export function getWorkScore(item: Pick<WorkItem, "status" | "assetUrl">) {
  const base = score[item.status] ?? 0;
  return Math.max(0, Math.min(100, base + (item.assetUrl && base < 80 ? 10 : 0)));
}

export function getWorkSummary(items: WorkItem[]): WorkSummary {
  const values = items.map(getWorkScore);
  return {
    total: items.length,
    ready: items.filter((item) => ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(item.status)).length,
    needsAsset: items.filter((item) => !item.assetUrl && ["ASSET", "REVIEW", "APPROVED"].includes(item.status)).length,
    measured: items.filter((item) => item.status === "MEASURED").length,
    averageProgress: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
  };
}
