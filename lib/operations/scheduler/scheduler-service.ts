import { listScheduledContentItems } from "../repository";
import type { SchedulerOverview } from "./scheduler-types";

export async function getSchedulerOverview(): Promise<SchedulerOverview> {
  const dataset = await listScheduledContentItems();
  const scheduledContentItems = dataset.items;

  return {
    source: "content-scheduler-repository",
    generatedAt: new Date().toISOString(),
    persistence: dataset.persistence,
    summary: {
      total: scheduledContentItems.length,
      scheduled: scheduledContentItems.filter((item) => item.status === "SCHEDULED").length,
      ready: scheduledContentItems.filter((item) => item.status === "READY").length,
      blocked: scheduledContentItems.filter((item) => item.status === "BLOCKED").length,
      messagingItems: scheduledContentItems.filter((item) => ["WHATSAPP", "EMAIL", "SMS"].includes(item.channel)).length,
    },
    items: scheduledContentItems,
  };
}
