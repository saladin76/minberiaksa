import { listOperationTasks } from "../repository";
import type { OperationsTaskOverview } from "./task-types";

export async function getTaskOverview(): Promise<OperationsTaskOverview> {
  const dataset = await listOperationTasks();
  const tasks = dataset.items;

  return {
    source: dataset.persistence.mode === "prisma" ? "operation-task-prisma" : "task-repository-foundation",
    generatedAt: new Date().toISOString(),
    persistence: dataset.persistence,
    summary: {
      totalTasks: tasks.length,
      pending: tasks.filter((task) => task.status === "PENDING").length,
      inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
      blocked: tasks.filter((task) => task.status === "BLOCKED").length,
      done: tasks.filter((task) => task.status === "DONE").length,
      highPriority: tasks.filter((task) => task.priority === "HIGH").length,
    },
    tasks,
  };
}
