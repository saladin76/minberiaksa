import type { PlanningActionPriority } from "@/lib/operations/planning/planning-types";
import type { OperationsTaskStatus } from "./task-types";

export function getInitialTaskStatus(priority: PlanningActionPriority): OperationsTaskStatus {
  if (priority === "HIGH") return "PENDING";
  return "PENDING";
}

export function getInitialTaskProgress(status: OperationsTaskStatus) {
  if (status === "DONE") return 100;
  if (status === "IN_PROGRESS") return 35;
  return 0;
}

export function formatTaskTitle(title: string) {
  return title.replace(/^إنتاج\s+/u, "تنفيذ ");
}
