import type { PlanningActionPriority, PlanningActionType } from "@/lib/operations/planning/planning-types";
import type { OperationsPersistenceInfo } from "../persistence-types";

export type OperationsTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "NEEDS_REVIEW"
  | "DONE"
  | "MISSED"
  | "DELAYED"
  | "CANCELLED"
  | "BLOCKED";

export type OperationsTask = {
  id: string;
  planningActionId: string;
  seasonId: string;
  seasonTitle: string;
  type: PlanningActionType;
  title: string;
  priority: PlanningActionPriority;
  status: OperationsTaskStatus;
  assignee: string;
  dueLabel: string;
  progress: number;
  sourceReason: string;
};

export type OperationsTaskOverview = {
  source: string;
  generatedAt: string;
  persistence: OperationsPersistenceInfo;
  summary: {
    totalTasks: number;
    pending: number;
    inProgress: number;
    blocked: number;
    done: number;
    highPriority: number;
  };
  tasks: OperationsTask[];
};
