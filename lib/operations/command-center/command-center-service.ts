import type { OperationsOverview } from "@/lib/operations/types";
import { getTaskOverview } from "@/lib/operations/tasks/task-service";
import { getProductionBoardOverview } from "@/lib/operations/production/production-service";
import { getArchiveOverview } from "@/lib/operations/archive/archive-service";

export type OperationsCommandPriority = "HIGH" | "MEDIUM" | "LOW";

export type OperationsCommandActionType =
  | "PREPARE_SEASON"
  | "UNBLOCK_TASKS"
  | "MOVE_PRODUCTION"
  | "PUBLISH_READY_ASSETS"
  | "SEND_TO_MARKETING"
  | "ARCHIVE_REUSABLE_ASSETS";

export type OperationsCommandAction = {
  id: string;
  type: OperationsCommandActionType;
  priority: OperationsCommandPriority;
  title: string;
  reason: string;
  href: string;
  cta: string;
};

export type OperationsCommandCenterOverview = {
  source: string;
  generatedAt: string;
  summary: {
    openSeasons: number;
    activePlans: number;
    openTasks: number;
    blockedTasks: number;
    productionReady: number;
    archiveReady: number;
    readyForMarketing: number;
  };
  actions: OperationsCommandAction[];
};

export async function buildOperationsCommandCenterOverview(
  operations: OperationsOverview,
): Promise<OperationsCommandCenterOverview> {
  const [taskOverview, production, archive] = await Promise.all([
    getTaskOverview(),
    getProductionBoardOverview(),
    getArchiveOverview(),
  ]);

  const actions: OperationsCommandAction[] = [];

  for (const season of operations.seasons.filter((item) => item.progress < 80).slice(0, 4)) {
    actions.push({
      id: `season-${season.id ?? season.title}`,
      type: "PREPARE_SEASON",
      priority: season.progress < 50 ? "HIGH" : "MEDIUM",
      title: `جهّز محتوى موسم: ${season.title}`,
      reason: `الموسم في حالة ${season.status} والتقدم الحالي ${season.progress}% فقط. المطلوب ${season.required} مادة والجاهز ${season.ready}.`,
      href: "/dashboard/operations/calendar",
      cta: "فتح التقويم",
    });
  }

  for (const task of taskOverview.tasks.filter((item) => item.status === "BLOCKED" || item.priority === "HIGH").slice(0, 5)) {
    actions.push({
      id: `task-${task.id}`,
      type: "UNBLOCK_TASKS",
      priority: task.status === "BLOCKED" ? "HIGH" : "MEDIUM",
      title: `راجع مهمة: ${task.title}`,
      reason: `المسؤول: ${task.assignee}. الحالة: ${task.status}. مرتبطة بموسم ${task.seasonTitle}.`,
      href: "/dashboard/operations/tasks",
      cta: "فتح المهام",
    });
  }

  for (const column of production.columns) {
    const urgentItems = column.items.filter((item) => item.priority === "HIGH").slice(0, 3);
    for (const item of urgentItems) {
      actions.push({
        id: `production-${item.id}`,
        type: "MOVE_PRODUCTION",
        priority: "HIGH",
        title: `حرّك مادة الإنتاج: ${item.title}`,
        reason: `المادة عالية الأولوية وحالتها الحالية ${item.stage}. النوع: ${item.contentType}.`,
        href: "/dashboard/operations/production",
        cta: "فتح لوحة الإنتاج",
      });
    }
  }

  if (production.summary.ready > 0) {
    actions.push({
      id: "production-ready-for-marketing",
      type: "SEND_TO_MARKETING",
      priority: "MEDIUM",
      title: "سلّم المواد الجاهزة للتسويق",
      reason: `يوجد ${production.summary.ready} مادة جاهزة يمكن استخدامها في الحملات أو النشر.`,
      href: "/dashboard/operations/production",
      cta: "فتح المواد الجاهزة",
    });
  }

  if (archive.summary.ready > 0) {
    actions.push({
      id: "archive-ready-assets",
      type: "ARCHIVE_REUSABLE_ASSETS",
      priority: "LOW",
      title: "راجع مواد الأرشيف الجاهزة لإعادة الاستخدام",
      reason: `يوجد ${archive.summary.ready} مادة جاهزة في الأرشيف، منها ${archive.summary.videos} فيديو و${archive.summary.designs} تصميم/كاروسيل.`,
      href: "/dashboard/operations/archive",
      cta: "فتح الأرشيف",
    });
  }

  return {
    source: "content-command-center-v1",
    generatedAt: new Date().toISOString(),
    summary: {
      openSeasons: operations.kpis.openSeasons,
      activePlans: operations.kpis.activePlans,
      openTasks: taskOverview.summary.pending + taskOverview.summary.inProgress + taskOverview.summary.blocked,
      blockedTasks: taskOverview.summary.blocked,
      productionReady: production.summary.ready,
      archiveReady: archive.summary.ready,
      readyForMarketing: operations.kpis.readyForMarketing,
    },
    actions: actions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 12),
  };
}

function priorityRank(priority: OperationsCommandPriority) {
  if (priority === "HIGH") return 0;
  if (priority === "MEDIUM") return 1;
  return 2;
}
