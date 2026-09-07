import type { OperationsPersistenceInfo } from "../persistence-types";

export type ScheduledChannel = "SOCIAL" | "WHATSAPP" | "EMAIL" | "SMS" | "TEAM_REMINDER";
export type ScheduledItemStatus = "DRAFT" | "READY" | "SCHEDULED" | "SENT" | "BLOCKED";
export type ScheduledManualStatus = "SCHEDULED" | "READY_FOR_MANUAL_SEND" | "PUBLISHED" | "MANUALLY_SENT" | "CANCELLED" | "FAILED";

export type ScheduledContentItem = {
  id: string;
  title: string;
  channel: ScheduledChannel;
  status: ScheduledItemStatus;
  campaignTheme: string;
  scheduledFor: string;
  owner: string;
  providerKey?: string;
  contentUrl?: string;
  note: string;
  publicationCount?: number;
  lastManualStatus?: ScheduledManualStatus | null;
  lastManualAt?: string | null;
  lastManualPlatform?: string | null;
};

export type SchedulerOverview = {
  source: string;
  generatedAt: string;
  persistence: OperationsPersistenceInfo;
  summary: {
    total: number;
    scheduled: number;
    ready: number;
    blocked: number;
    messagingItems: number;
  };
  items: ScheduledContentItem[];
};
