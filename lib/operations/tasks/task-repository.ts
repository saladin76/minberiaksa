import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanningActionPriority, PlanningActionType } from "../planning/planning-types";
import type { OperationsRepositoryResult } from "../persistence-types";
import { generateTasks } from "./task-engine";
import type { OperationsTask, OperationsTaskStatus } from "./task-types";

const actionTypes: PlanningActionType[] = ["WRITING", "DESIGN", "VIDEO", "CAROUSEL", "MESSAGING"];
const priorities: PlanningActionPriority[] = ["HIGH", "MEDIUM", "LOW"];
const statuses: OperationsTaskStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "NEEDS_REVIEW",
  "DONE",
  "MISSED",
  "DELAYED",
  "CANCELLED",
  "BLOCKED",
];

type OperationTaskRow = {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  planId: string | null;
  seasonId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  dueAt: Date | null;
  resultNotes: string | null;
};

export type OperationTaskMutationInput = {
  title?: string;
  description?: string | null;
  taskType?: PlanningActionType;
  status?: OperationsTaskStatus;
  priority?: PlanningActionPriority;
  assignedTo?: string | null;
  contentItemId?: string | null;
  planId?: string | null;
  seasonId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  dueAt?: Date | null;
  blockedReason?: string | null;
  resultNotes?: string | null;
  qualityRating?: number | null;
  workloadScore?: number | null;
};

export type OperationTaskMutationResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  message: string;
  task?: OperationsTask;
};

function foundationTasks(reason: string): OperationsRepositoryResult<OperationsTask> {
  return {
    items: generateTasks(),
    persistence: {
      mode: "foundation",
      storage: "computed-engine",
      readOnly: true,
      model: "OperationsTask",
      nextModel: "OperationTask",
      readyForDb: false,
      externalSideEffects: false,
      note: reason,
    },
  };
}

function unavailableWrite(message: string): OperationTaskMutationResult {
  return {
    ok: false,
    mode: "foundation",
    message,
  };
}

function asActionType(value: string | null | undefined): PlanningActionType {
  return actionTypes.includes(value as PlanningActionType) ? (value as PlanningActionType) : "WRITING";
}

function asPriority(value: string | null | undefined): PlanningActionPriority {
  return priorities.includes(value as PlanningActionPriority) ? (value as PlanningActionPriority) : "MEDIUM";
}

function asStatus(value: string | null | undefined): OperationsTaskStatus {
  return statuses.includes(value as OperationsTaskStatus) ? (value as OperationsTaskStatus) : "PENDING";
}

function progressFor(status: OperationsTaskStatus) {
  if (status === "DONE") return 100;
  if (status === "NEEDS_REVIEW") return 80;
  if (status === "IN_PROGRESS") return 50;
  if (status === "BLOCKED" || status === "DELAYED") return 25;
  return 0;
}

function dueLabelFor(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "غير محدد";
}

function timestampFor(status: OperationsTaskStatus) {
  const now = new Date();
  if (status === "IN_PROGRESS") return { startedAt: now };
  if (status === "NEEDS_REVIEW") return { reviewRequestedAt: now };
  if (status === "DONE") return { completedAt: now };
  return {};
}

function mapTask(row: OperationTaskRow): OperationsTask {
  const status = asStatus(row.status);

  return {
    id: row.id,
    planningActionId: row.sourceId ?? row.planId ?? row.id,
    seasonId: row.seasonId ?? "operation-season-db",
    seasonTitle: row.sourceType ?? "Operations",
    type: asActionType(row.taskType),
    title: row.title,
    priority: asPriority(row.priority),
    status,
    assignee: row.assignedTo ?? "غير معين",
    dueLabel: dueLabelFor(row.dueAt),
    progress: progressFor(status),
    sourceReason: row.description ?? row.resultNotes ?? "OperationTask from Prisma repository.",
  };
}

export async function listOperationTasksFromRepository(): Promise<OperationsRepositoryResult<OperationsTask>> {
  if (!process.env.DATABASE_URL) {
    return foundationTasks("DATABASE_URL is not configured; tasks are generated from the Planning Engine through the repository contract.");
  }

  try {
    const rows = await prisma.operationTask.findMany({
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    if (rows.length === 0) {
      return foundationTasks("OperationTask collection is empty; using generated foundation tasks until real task rows are created.");
    }

    return {
      items: rows.map(mapTask),
      persistence: {
        mode: "prisma",
        storage: "prisma",
        readOnly: false,
        model: "OperationTask",
        nextModel: "OperationTaskAuditTrail",
        readyForDb: true,
        externalSideEffects: false,
        note: "OperationTask is read through Prisma with safe create/update mutations. Scheduler, donor reactivation, sending, and publishing remain manual-first.",
      },
    };
  } catch (error) {
    console.error("OperationTask repository DB read failed", error);
    return foundationTasks("OperationTask repository DB read failed; using generated foundation tasks.");
  }
}

export async function createOperationTaskInRepository(
  input: Required<Pick<OperationTaskMutationInput, "title">> & OperationTaskMutationInput,
  actorId?: string | null,
): Promise<OperationTaskMutationResult> {
  if (!process.env.DATABASE_URL) {
    return unavailableWrite("DATABASE_URL is not configured; OperationTask was not created.");
  }

  try {
    const status = input.status ?? "PENDING";
    const row = await prisma.operationTask.create({
      data: {
        title: input.title,
        description: input.description ?? undefined,
        taskType: input.taskType ?? "WRITING",
        status,
        priority: input.priority ?? "MEDIUM",
        assignedTo: input.assignedTo ?? undefined,
        contentItemId: input.contentItemId ?? undefined,
        planId: input.planId ?? undefined,
        seasonId: input.seasonId ?? undefined,
        sourceType: input.sourceType ?? "MANUAL",
        sourceId: input.sourceId ?? undefined,
        dueAt: input.dueAt ?? undefined,
        blockedReason: input.blockedReason ?? undefined,
        resultNotes: input.resultNotes ?? undefined,
        qualityRating: input.qualityRating ?? undefined,
        workloadScore: input.workloadScore ?? undefined,
        createdBy: actorId ?? undefined,
        updatedBy: actorId ?? undefined,
        ...timestampFor(status),
      },
    });

    return {
      ok: true,
      mode: "prisma",
      message: "OperationTask created.",
      task: mapTask(row),
    };
  } catch (error) {
    console.error("OperationTask create failed", error);
    return { ok: false, mode: "prisma", message: "OperationTask create failed." };
  }
}

export async function updateOperationTaskInRepository(
  id: string,
  input: OperationTaskMutationInput,
  actorId?: string | null,
): Promise<OperationTaskMutationResult> {
  if (!process.env.DATABASE_URL) {
    return unavailableWrite("DATABASE_URL is not configured; OperationTask was not updated.");
  }

  try {
    const data: Prisma.OperationTaskUpdateInput = {
      updatedBy: actorId ?? undefined,
    };

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.taskType !== undefined) data.taskType = input.taskType;
    if (input.status !== undefined) Object.assign(data, { status: input.status, ...timestampFor(input.status) });
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
    if (input.contentItemId !== undefined) data.contentItemId = input.contentItemId;
    if (input.planId !== undefined) data.planId = input.planId;
    if (input.seasonId !== undefined) data.seasonId = input.seasonId;
    if (input.sourceType !== undefined) data.sourceType = input.sourceType;
    if (input.sourceId !== undefined) data.sourceId = input.sourceId;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt;
    if (input.blockedReason !== undefined) data.blockedReason = input.blockedReason;
    if (input.resultNotes !== undefined) data.resultNotes = input.resultNotes;
    if (input.qualityRating !== undefined) data.qualityRating = input.qualityRating;
    if (input.workloadScore !== undefined) data.workloadScore = input.workloadScore;

    const row = await prisma.operationTask.update({
      where: { id },
      data,
    });

    return {
      ok: true,
      mode: "prisma",
      message: "OperationTask updated.",
      task: mapTask(row),
    };
  } catch (error) {
    console.error("OperationTask update failed", error);
    return { ok: false, mode: "prisma", message: "OperationTask update failed." };
  }
}
