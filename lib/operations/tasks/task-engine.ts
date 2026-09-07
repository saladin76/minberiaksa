import { getPlanningOverview } from "@/lib/operations/planning/planning-service";
import { formatTaskTitle, getInitialTaskProgress, getInitialTaskStatus } from "./task-rules";
import type { OperationsTask } from "./task-types";

export function generateTasks(): OperationsTask[] {
  const planning = getPlanningOverview();

  return planning.actions.map((action) => {
    const status = getInitialTaskStatus(action.priority);

    return {
      id: `task-${action.id}`,
      planningActionId: action.id,
      seasonId: action.seasonId,
      seasonTitle: action.seasonTitle,
      type: action.type,
      title: formatTaskTitle(action.title),
      priority: action.priority,
      status,
      assignee: action.suggestedOwner,
      dueLabel: action.dueLabel,
      progress: getInitialTaskProgress(status),
      sourceReason: action.reason,
    };
  });
}
