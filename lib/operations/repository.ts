import { archiveAssets } from "./archive/archive-data";
import type { ArchiveAsset } from "./archive/archive-types";
import { readAuditBackedContentItemState } from "./content-item-repository";
import { readRuntimeContentItems } from "./content-item-runtime-repository";
import { readAuditBackedContentPublications } from "./content-publication-repository";
import { mergeFoundationRecords, readFoundationOverrideState } from "./foundation-override-repository";
import { createFallbackOperationsOverview } from "./mock-data";
import { productionItems } from "./production/production-data";
import type { ProductionItem } from "./production/production-types";
import { scheduledContentItems } from "./scheduler/scheduler-data";
import type { ScheduledContentItem, ScheduledManualStatus } from "./scheduler/scheduler-types";
import { listOperationTasksFromRepository } from "./tasks/task-repository";
import type { OperationsTask } from "./tasks/task-types";
import type { OperationsPersistenceInfo, OperationsRepositoryResult } from "./persistence-types";
import type { OperationsContentItem, OperationsContentPlan, OperationsContentTask, OperationsOverview, OperationsSeason, OperationsWeeklyTheme } from "./types";

const scheduledManualStatuses: ScheduledManualStatus[] = ["SCHEDULED", "READY_FOR_MANUAL_SEND", "PUBLISHED", "MANUALLY_SENT", "CANCELLED", "FAILED"];

function foundationPersistence(
  model: string,
  nextModel: string,
  options: { storage?: OperationsPersistenceInfo["storage"]; readyForDb?: boolean; note?: string } = {},
): OperationsPersistenceInfo {
  return {
    mode: "foundation",
    storage: options.storage ?? "module-data",
    readOnly: true,
    model,
    nextModel,
    readyForDb: options.readyForDb ?? true,
    externalSideEffects: false,
    note: options.note ?? "Foundation data is served through a repository contract and can be replaced by Prisma without changing page contracts.",
  };
}

function fromFoundation<T>(
  items: T[],
  model: string,
  nextModel: string,
  options?: { storage?: OperationsPersistenceInfo["storage"]; readyForDb?: boolean; note?: string },
): OperationsRepositoryResult<T> {
  return {
    items: [...items],
    persistence: foundationPersistence(model, nextModel, options),
  };
}

function runtimeContentPersistence(count: number): OperationsPersistenceInfo {
  return {
    mode: "prisma",
    storage: "prisma",
    readOnly: false,
    model: "ContentItem",
    nextModel: "ContentPublication",
    readyForDb: true,
    externalSideEffects: false,
    note: `${count} content item(s) are read from the dedicated ContentItem runtime delegate. Publishing and sending remain manual-only.`,
  };
}

function auditBackedContentPersistence(count: number): OperationsPersistenceInfo {
  return {
    mode: "prisma",
    storage: "prisma",
    readOnly: false,
    model: "OperationsContentItemAuditLog",
    nextModel: "ContentItem",
    readyForDb: true,
    externalSideEffects: false,
    note: `${count} content item change(s) are persisted through DB-backed AuditLog records until the dedicated ContentItem runtime model is appended. No publishing, sending, or AI approval is automatic.`,
  };
}

function mergeContentItemsWithFallback(params: {
  fallbackItems: OperationsContentItem[];
  savedItems: OperationsContentItem[];
  deletedIds: string[];
}) {
  const deletedIds = new Set(params.deletedIds.filter(Boolean));
  const savedIds = new Set(params.savedItems.map((item) => item.id).filter(Boolean));
  const fallbackItems = params.fallbackItems.filter((item) => {
    if (!item.id) return true;
    return !deletedIds.has(item.id) && !savedIds.has(item.id);
  });

  return [...params.savedItems, ...fallbackItems];
}

function latestIso(values: Array<string | null>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0]?.toISOString() ?? null;
}

async function attachPublicationMarkers(items: OperationsContentItem[]): Promise<OperationsContentItem[]> {
  const publications = await readAuditBackedContentPublications();
  if (publications.length === 0) return items;

  return items.map((item) => {
    if (!item.id) return item;
    const itemPublications = publications.filter((publication) => publication.contentItemId === item.id);
    if (itemPublications.length === 0) return item;
    return {
      ...item,
      publicationCount: itemPublications.length,
      lastPublishedAt: latestIso(itemPublications.map((publication) => publication.publishedAt)),
      publishedPlatforms: [...new Set(itemPublications.map((publication) => publication.platform))],
    };
  });
}

function publicationTime(publication: { publishedAt: string | null; scheduledAt: string | null }) {
  return publication.publishedAt ?? publication.scheduledAt;
}

function asScheduledManualStatus(value: string | null | undefined): ScheduledManualStatus | null {
  return scheduledManualStatuses.includes(value as ScheduledManualStatus) ? (value as ScheduledManualStatus) : null;
}

async function attachSchedulerPublicationMarkers(items: ScheduledContentItem[]): Promise<ScheduledContentItem[]> {
  const publications = await readAuditBackedContentPublications();
  if (publications.length === 0) return items;

  return items.map((item) => {
    const itemPublications = publications.filter((publication) => publication.contentItemId === item.id);
    if (itemPublications.length === 0) return item;
    const latest = [...itemPublications].sort((a, b) => {
      const aTime = publicationTime(a) ? new Date(publicationTime(a) as string).getTime() : 0;
      const bTime = publicationTime(b) ? new Date(publicationTime(b) as string).getTime() : 0;
      return bTime - aTime;
    })[0];

    return {
      ...item,
      publicationCount: itemPublications.length,
      lastManualStatus: asScheduledManualStatus(latest?.status),
      lastManualAt: latest ? publicationTime(latest) : null,
      lastManualPlatform: latest?.platform ?? null,
    };
  });
}

export async function listScheduledContentItems(): Promise<OperationsRepositoryResult<ScheduledContentItem>> {
  const items = await attachSchedulerPublicationMarkers(scheduledContentItems);
  return fromFoundation(items, "ScheduledContentItem", "ContentSchedule", {
    note: "Scheduler items are foundation records, while manual send/cancel markers are read from audit-backed ContentPublication records when available.",
  });
}

export async function listProductionItems(): Promise<OperationsRepositoryResult<ProductionItem>> {
  return fromFoundation(productionItems, "ProductionItem", "OperationProductionItem");
}

export async function listArchiveAssets(): Promise<OperationsRepositoryResult<ArchiveAsset>> {
  return fromFoundation(archiveAssets, "ArchiveAsset", "OperationArchiveAsset");
}

export async function listContentItems(): Promise<OperationsRepositoryResult<OperationsContentItem>> {
  const overview = createFallbackOperationsOverview();
  const runtimeItems = await readRuntimeContentItems();
  if (runtimeItems) {
    return {
      items: await attachPublicationMarkers(runtimeItems.length > 0 ? runtimeItems : overview.items),
      persistence: runtimeContentPersistence(runtimeItems.length),
    };
  }

  const auditState = await readAuditBackedContentItemState();
  const items = await attachPublicationMarkers(
    mergeContentItemsWithFallback({
      fallbackItems: overview.items,
      savedItems: auditState.items,
      deletedIds: auditState.deletedIds,
    }),
  );

  if (auditState.items.length > 0 || auditState.deletedIds.length > 0) {
    return {
      items,
      persistence: auditBackedContentPersistence(auditState.items.length + auditState.deletedIds.length),
    };
  }

  return fromFoundation(items, "OperationsContentItem", "ContentItem");
}

export async function listContentWorkflowTasks(): Promise<OperationsRepositoryResult<OperationsContentTask>> {
  const overview = createFallbackOperationsOverview();
  return fromFoundation(overview.tasks, "OperationsContentTask", "OperationContentTask");
}

export async function listOperationTasks(): Promise<OperationsRepositoryResult<OperationsTask>> {
  return listOperationTasksFromRepository();
}

export async function getContentOperationsOverview(): Promise<OperationsOverview> {
  const [contentItems, contentTasks, seasonOverrides, weeklyThemeOverrides, planOverrides, taskOverrides] = await Promise.all([
    listContentItems(),
    listContentWorkflowTasks(),
    readFoundationOverrideState<OperationsSeason>("seasons"),
    readFoundationOverrideState<OperationsWeeklyTheme>("weeklyThemes"),
    readFoundationOverrideState<OperationsContentPlan>("plans"),
    readFoundationOverrideState<OperationsContentTask>("tasks"),
  ]);
  const overview = createFallbackOperationsOverview();
  const seasons = mergeFoundationRecords(overview.seasons, seasonOverrides);
  const weeklyThemes = mergeFoundationRecords(overview.weeklyThemes, weeklyThemeOverrides);
  const plans = mergeFoundationRecords(overview.plans, planOverrides);
  const tasks = mergeFoundationRecords(contentTasks.items, taskOverrides);

  return {
    ...overview,
    source: contentItems.persistence.model === "ContentItem" ? "content-operations-runtime" : contentItems.persistence.mode === "prisma" ? "content-operations-audit-backed" : "content-operations-repository",
    version: contentItems.persistence.model === "ContentItem" ? "operations-overview-runtime" : contentItems.persistence.mode === "prisma" ? "operations-overview-audit-backed" : "operations-overview-foundation",
    kpis: {
      ...overview.kpis,
      openSeasons: seasons.length,
      activePlans: plans.filter((plan) => plan.status === "ACTIVE" || plan.status === "PLANNING").length,
      contentItems: contentItems.items.length,
      openProductionTasks: tasks.length,
      readyForMarketing: contentItems.items.filter((item) => item.status === "APPROVED").length,
    },
    seasons,
    weeklyThemes,
    plans,
    items: contentItems.items,
    tasks,
    persistence: contentItems.persistence.mode === "prisma"
      ? contentItems.persistence
      : foundationPersistence("OperationsOverview", "OperationContentWorkspace", {
          note: "Content workspace data is grouped behind a repository contract while seasons and plans remain foundation records.",
        }),
  };
}

export async function getOperationsPersistenceSnapshot() {
  const [scheduler, production, archive, content, tasks] = await Promise.all([
    listScheduledContentItems(),
    listProductionItems(),
    listArchiveAssets(),
    listContentItems(),
    listOperationTasks(),
  ]);
  const datasets = [
    {
      key: "scheduler",
      label: "Content Scheduler",
      total: scheduler.items.length,
      persistence: scheduler.persistence,
    },
    {
      key: "production",
      label: "Production Board",
      total: production.items.length,
      persistence: production.persistence,
    },
    {
      key: "archive",
      label: "Archive Center",
      total: archive.items.length,
      persistence: archive.persistence,
    },
    {
      key: "content",
      label: "Content Items",
      total: content.items.length,
      persistence: content.persistence,
    },
    {
      key: "tasks",
      label: "Operations Tasks",
      total: tasks.items.length,
      persistence: tasks.persistence,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    datasets,
    summary: {
      totalRecords: datasets.reduce((sum, dataset) => sum + dataset.total, 0),
      foundationDatasets: datasets.filter((dataset) => dataset.persistence.mode === "foundation").length,
      dbReadyDatasets: datasets.filter((dataset) => dataset.persistence.readyForDb).length,
      generatedDatasets: datasets.filter((dataset) => dataset.persistence.storage === "computed-engine").length,
    },
  };
}
