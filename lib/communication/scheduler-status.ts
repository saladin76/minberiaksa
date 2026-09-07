import { prisma } from "@/lib/prisma";
import { safeCountValue } from "@/lib/dashboard/safe-count";

export const SCHEDULER_RUN_ACTION = "communication.scheduler.run";
export const SCHEDULER_RUN_FAILED_ACTION = "communication.scheduler.run.failed";

export function isSchedulerConfigured(): boolean {
  return !!process.env.CRON_SECRET;
}

export type SchedulerStatus = {
  configured: boolean;
  scheduledCount: number;
  dueCount: number;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
};

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  const configured = isSchedulerConfigured();
  if (!process.env.DATABASE_URL) return { configured, scheduledCount: 0, dueCount: 0, lastRunAt: null, lastSuccessfulRunAt: null };
  const now = new Date();
  const [scheduledCount, dueCount, lastRun, lastSuccess] = await Promise.all([
    safeCountValue("scheduler.scheduled", () => prisma.communicationCampaign.count({ where: { status: "SCHEDULED" } })),
    safeCountValue("scheduler.due", () => prisma.communicationCampaign.count({ where: { status: "SCHEDULED", scheduledAt: { lte: now } } })),
    prisma.auditLog.findFirst({ where: { action: { in: [SCHEDULER_RUN_ACTION, SCHEDULER_RUN_FAILED_ACTION] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    prisma.auditLog.findFirst({ where: { action: SCHEDULER_RUN_ACTION }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
  ]);
  return {
    configured,
    scheduledCount,
    dueCount,
    lastRunAt: lastRun?.createdAt ? lastRun.createdAt.toISOString() : null,
    lastSuccessfulRunAt: lastSuccess?.createdAt ? lastSuccess.createdAt.toISOString() : null,
  };
}
