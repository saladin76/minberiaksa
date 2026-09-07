/**
 * Shared contract for every platform sync client.
 *
 * Every client implements `syncConnection` and never throws. Errors,
 * missing credentials, and not-implemented stubs are returned as typed
 * `SyncClientResult` so the dispatcher / API layer can record an audit
 * entry and a `PlatformSyncRun` row without crashing the dashboard.
 *
 * Snapshots are returned in a normalized shape and persisted by the
 * dispatcher — clients don't touch Prisma directly.
 */
import type { MarketingPlatformConnection } from "@prisma/client";

export type SyncStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "MISSING_CONFIG"
  | "NOT_IMPLEMENTED"
  | "PARTIAL_SUCCESS";

export interface SyncCampaignSnapshot {
  date: Date;
  campaignId: string;
  campaignName?: string | null;
  status?: string | null;
  objective?: string | null;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number | null;
  cpc?: number | null;
  cpm?: number | null;
  reportedConversions?: number;
  reportedConversionValue?: number;
  currency?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface SyncAdGroupSnapshot {
  date: Date;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroupId: string;
  adGroupName?: string | null;
  country?: string | null;
  age?: string | null;
  gender?: string | null;
  placement?: string | null;
  spend?: number;
  impressions?: number;
  clicks?: number;
  reportedConversions?: number;
  reportedConversionValue?: number;
  currency?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface SyncAdSnapshot {
  date: Date;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroupId?: string | null;
  adGroupName?: string | null;
  adId: string;
  adName?: string | null;
  creativeName?: string | null;
  placement?: string | null;
  country?: string | null;
  spend?: number;
  impressions?: number;
  clicks?: number;
  reportedConversions?: number;
  reportedConversionValue?: number;
  currency?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface SyncMessagingSnapshot {
  provider: "TWILIO" | "CUSTOM" | "EMAIL_PROVIDER" | "OTHER";
  channel:
    | "TWILIO_EMAIL"
    | "TWILIO_WHATSAPP"
    | "TWILIO_SMS"
    | "EMAIL"
    | "WHATSAPP"
    | "SMS";
  date: Date;
  campaignId?: string | null;
  campaignName?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  messageVariant?: string | null;
  audienceSegment?: string | null;
  sent?: number;
  delivered?: number;
  failed?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  donations?: number;
  revenue?: number;
  cost?: number;
  currency?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface SyncClientResult {
  status: SyncStatus;
  rowsFetched: number;
  message: string;
  error?: string;
  missingRequiredFields?: string[];
  snapshots?: {
    campaigns?: SyncCampaignSnapshot[];
    adGroups?: SyncAdGroupSnapshot[];
    ads?: SyncAdSnapshot[];
    messaging?: SyncMessagingSnapshot[];
  };
}

export interface SyncInput {
  connection: MarketingPlatformConnection;
  dateFrom: Date;
  dateTo: Date;
}

export type SyncClient = (input: SyncInput) => Promise<SyncClientResult>;

/** Build a `not_implemented` result with consistent Arabic messaging. */
export function notImplementedResult(message: string): SyncClientResult {
  return {
    status: "NOT_IMPLEMENTED",
    rowsFetched: 0,
    message,
  };
}

/** Build a `missing_config` result. */
export function missingConfigResult(
  missingRequiredFields: string[],
  message: string
): SyncClientResult {
  return {
    status: "MISSING_CONFIG",
    rowsFetched: 0,
    message,
    missingRequiredFields,
  };
}
