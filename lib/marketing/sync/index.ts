/**
 * Sync dispatcher.
 *
 * Resolves connections, fans out to the right platform client, persists the
 * returned snapshots, and writes a `PlatformSyncRun` audit row for every
 * attempt. Never throws — failed connections are recorded as `FAILED` and
 * the loop continues so a missing-config Meta connection cannot block a
 * working Twilio sync.
 */
import { prisma } from "@/lib/prisma";
import type { MarketingPlatformConnection, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { redactSecretsFromMetadata } from "@/lib/marketing/secrets";
import type {
  SyncAdGroupSnapshot,
  SyncAdSnapshot,
  SyncCampaignSnapshot,
  SyncClient,
  SyncClientResult,
  SyncMessagingSnapshot,
  SyncStatus,
} from "./types";
import { syncMeta } from "./meta";
import { syncGoogleAds } from "./google-ads";
import { syncTikTok } from "./tiktok";
import { syncX } from "./x";
import { syncGa4 } from "./ga4";
import { syncTwilio } from "./twilio";
import { notImplementedResult } from "./types";

export type PlatformSelector =
  | "meta"
  | "google_ads"
  | "tiktok"
  | "x"
  | "ga4"
  | "twilio"
  | "all";

const CLIENT_BY_PLATFORM: Record<string, SyncClient> = {
  META: syncMeta,
  GOOGLE_ADS: syncGoogleAds,
  TIKTOK: syncTikTok,
  X: syncX,
  GA4: syncGa4,
  TWILIO: syncTwilio,
};

const SELECTOR_TO_DB_PLATFORM: Record<Exclude<PlatformSelector, "all">, string> = {
  meta: "META",
  google_ads: "GOOGLE_ADS",
  tiktok: "TIKTOK",
  x: "X",
  ga4: "GA4",
  twilio: "TWILIO",
};

export interface SyncJobInput {
  platform: PlatformSelector;
  connectionId?: string;
  dateFrom: Date;
  dateTo: Date;
  triggeredBy?: string | null;
}

export interface SyncJobResult {
  connectionId: string | null;
  platform: string;
  status: SyncStatus;
  rowsFetched: number;
  missingRequiredFields: string[];
  message: string;
  error?: string;
  runId: string;
}

export interface SyncJobOutcome {
  ok: boolean;
  status: "success" | "partial_success" | "missing_config" | "not_implemented" | "failed";
  results: SyncJobResult[];
}

export async function runSyncJob(input: SyncJobInput): Promise<SyncJobOutcome> {
  const connections = await pickConnections(input);
  if (connections.length === 0) {
    // We still surface a `not_implemented` style outcome so the UI shows a
    // meaningful message rather than a silent success.
    return {
      ok: false,
      status: "not_implemented",
      results: [],
    };
  }

  const results: SyncJobResult[] = [];
  for (const connection of connections) {
    const result = await runSingleConnection({
      connection,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      triggeredBy: input.triggeredBy ?? null,
    });
    results.push(result);
  }

  const ok = results.every((r) => r.status === "SUCCESS");
  const allMissing = results.every((r) => r.status === "MISSING_CONFIG");
  const allNotImpl = results.every((r) => r.status === "NOT_IMPLEMENTED");
  const anyFail = results.some((r) => r.status === "FAILED");
  const partial =
    results.some((r) => r.status === "SUCCESS") && results.some((r) => r.status !== "SUCCESS");

  let aggregate: SyncJobOutcome["status"] = "failed";
  if (ok) aggregate = "success";
  else if (allMissing) aggregate = "missing_config";
  else if (allNotImpl) aggregate = "not_implemented";
  else if (partial) aggregate = "partial_success";
  else if (anyFail) aggregate = "failed";

  return { ok, status: aggregate, results };
}

async function pickConnections(input: SyncJobInput): Promise<MarketingPlatformConnection[]> {
  if (input.connectionId) {
    const single = await prisma.marketingPlatformConnection.findUnique({
      where: { id: input.connectionId },
    });
    return single ? [single] : [];
  }
  const where: Prisma.MarketingPlatformConnectionWhereInput = { enabled: true };
  if (input.platform !== "all") {
    where.platform = SELECTOR_TO_DB_PLATFORM[input.platform];
  } else {
    where.platform = { in: Object.values(SELECTOR_TO_DB_PLATFORM) };
  }
  return prisma.marketingPlatformConnection.findMany({ where });
}

interface SingleConnectionInput {
  connection: MarketingPlatformConnection;
  dateFrom: Date;
  dateTo: Date;
  triggeredBy: string | null;
}

async function runSingleConnection(input: SingleConnectionInput): Promise<SyncJobResult> {
  const { connection, dateFrom, dateTo, triggeredBy } = input;
  const client = CLIENT_BY_PLATFORM[connection.platform];
  const startedAt = new Date();
  const run = await prisma.platformSyncRun.create({
    data: {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId,
      dateFrom,
      dateTo,
      status: "RUNNING",
      startedAt,
      triggeredBy: triggeredBy ?? undefined,
      metadata: redactSecretsFromMetadata({
        platform: connection.platform,
        connectionName: connection.name,
      }) as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    actorId: triggeredBy ?? undefined,
    actorRole: "ADMIN",
    action: "MARKETING_PLATFORM_SYNC_STARTED",
    messageAr: `بدأ مزامنة ${connection.platform} — ${connection.name}`,
    entityType: "PlatformSyncRun",
    entityId: run.id,
    metadata: redactSecretsFromMetadata({
      connectionId: connection.id,
      platform: connection.platform,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    }),
    stream: "TEAM",
  });

  let result: SyncClientResult;
  if (!client) {
    result = notImplementedResult(
      `لا يوجد عميل مزامنة لمنصة ${connection.platform} بعد.`
    );
  } else {
    try {
      result = await client({ connection, dateFrom, dateTo });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        status: "FAILED",
        rowsFetched: 0,
        message: `فشل غير متوقع أثناء المزامنة: ${message.slice(0, 200)}`,
        error: message.slice(0, 240),
      };
    }
  }

  let rowsFetched = 0;
  if (result.snapshots) {
    try {
      const persisted = await persistSnapshots(connection, result.snapshots);
      rowsFetched = persisted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        ...result,
        status: "FAILED",
        error: `فشل حفظ اللقطات: ${message.slice(0, 200)}`,
        message: "فشل حفظ اللقطات بعد الجلب.",
      };
    }
  }
  if (rowsFetched > 0) {
    result = { ...result, rowsFetched: Math.max(rowsFetched, result.rowsFetched) };
  }

  const finishedAt = new Date();
  await prisma.platformSyncRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      finishedAt,
      rowsFetched: result.rowsFetched,
      error: result.error ?? null,
      metadata: redactSecretsFromMetadata({
        platform: connection.platform,
        connectionName: connection.name,
        missingRequiredFields: result.missingRequiredFields ?? [],
        message: result.message,
      }) as Prisma.InputJsonValue,
    },
  });
  if (
    result.status === "SUCCESS" ||
    result.status === "PARTIAL_SUCCESS"
  ) {
    await prisma.marketingPlatformConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: finishedAt, lastError: null },
    });
  } else if (result.status === "FAILED") {
    await prisma.marketingPlatformConnection.update({
      where: { id: connection.id },
      data: { lastError: result.error ?? result.message },
    });
  }

  await writeAuditLog({
    actorId: triggeredBy ?? undefined,
    actorRole: "ADMIN",
    action: auditActionForStatus(result.status),
    messageAr: auditMessageAr(connection, result),
    entityType: "PlatformSyncRun",
    entityId: run.id,
    metadata: redactSecretsFromMetadata({
      connectionId: connection.id,
      platform: connection.platform,
      status: result.status,
      rowsFetched: result.rowsFetched,
      missingRequiredFields: result.missingRequiredFields ?? [],
      error_summary: result.error ?? null,
      triggeredBy: triggeredBy ?? null,
    }),
    stream: "TEAM",
  });

  return {
    runId: run.id,
    connectionId: connection.id,
    platform: connection.platform,
    status: result.status,
    rowsFetched: result.rowsFetched,
    missingRequiredFields: result.missingRequiredFields ?? [],
    message: result.message,
    error: result.error,
  };
}

function auditActionForStatus(status: SyncStatus): string {
  switch (status) {
    case "SUCCESS":
    case "PARTIAL_SUCCESS":
      return "MARKETING_PLATFORM_SYNC_FINISHED";
    case "MISSING_CONFIG":
      return "MARKETING_PLATFORM_SYNC_MISSING_CONFIG";
    case "NOT_IMPLEMENTED":
      return "MARKETING_PLATFORM_SYNC_NOT_IMPLEMENTED";
    default:
      return "MARKETING_PLATFORM_SYNC_FAILED";
  }
}

function auditMessageAr(
  connection: MarketingPlatformConnection,
  result: SyncClientResult
): string {
  switch (result.status) {
    case "SUCCESS":
      return `اكتملت مزامنة ${connection.platform} — ${connection.name} (${result.rowsFetched} سجل).`;
    case "PARTIAL_SUCCESS":
      return `مزامنة ${connection.platform} اكتملت جزئيًا — ${connection.name}.`;
    case "MISSING_CONFIG":
      return `مزامنة ${connection.platform} موقوفة — إعدادات ناقصة (${connection.name}).`;
    case "NOT_IMPLEMENTED":
      return `مزامنة ${connection.platform} غير مفعّلة بعد — ${connection.name}.`;
    default:
      return `فشلت مزامنة ${connection.platform} — ${connection.name}.`;
  }
}

async function persistSnapshots(
  connection: MarketingPlatformConnection,
  snapshots: NonNullable<SyncClientResult["snapshots"]>
): Promise<number> {
  let count = 0;
  if (snapshots.campaigns) count += await upsertCampaigns(connection, snapshots.campaigns);
  if (snapshots.adGroups) count += await upsertAdGroups(connection, snapshots.adGroups);
  if (snapshots.ads) count += await upsertAds(connection, snapshots.ads);
  if (snapshots.messaging) count += await upsertMessaging(connection, snapshots.messaging);
  return count;
}

async function upsertCampaigns(
  connection: MarketingPlatformConnection,
  rows: SyncCampaignSnapshot[]
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const existing = await prisma.adCampaignSnapshot.findFirst({
      where: { connectionId: connection.id, campaignId: r.campaignId, date: r.date },
      select: { id: true },
    });
    const data = {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId ?? null,
      date: r.date,
      campaignId: r.campaignId,
      campaignName: r.campaignName ?? null,
      status: r.status ?? null,
      objective: r.objective ?? null,
      spend: r.spend ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      ctr: r.ctr ?? null,
      cpc: r.cpc ?? null,
      cpm: r.cpm ?? null,
      reportedConversions: r.reportedConversions ?? 0,
      reportedConversionValue: r.reportedConversionValue ?? 0,
      currency: r.currency ?? connection.defaultCurrency ?? null,
      raw: (r.raw ?? null) as Prisma.InputJsonValue | null,
    };
    if (existing) {
      await prisma.adCampaignSnapshot.update({
        where: { id: existing.id },
        data: data as Prisma.AdCampaignSnapshotUncheckedUpdateInput,
      });
    } else {
      await prisma.adCampaignSnapshot.create({
        data: data as Prisma.AdCampaignSnapshotUncheckedCreateInput,
      });
    }
    n += 1;
  }
  return n;
}

async function upsertAdGroups(
  connection: MarketingPlatformConnection,
  rows: SyncAdGroupSnapshot[]
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const existing = await prisma.adGroupSnapshot.findFirst({
      where: { connectionId: connection.id, adGroupId: r.adGroupId, date: r.date },
      select: { id: true },
    });
    const data = {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId ?? null,
      date: r.date,
      campaignId: r.campaignId ?? null,
      campaignName: r.campaignName ?? null,
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName ?? null,
      country: r.country ?? null,
      age: r.age ?? null,
      gender: r.gender ?? null,
      placement: r.placement ?? null,
      spend: r.spend ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      reportedConversions: r.reportedConversions ?? 0,
      reportedConversionValue: r.reportedConversionValue ?? 0,
      currency: r.currency ?? connection.defaultCurrency ?? null,
      raw: (r.raw ?? null) as Prisma.InputJsonValue | null,
    };
    if (existing) {
      await prisma.adGroupSnapshot.update({
        where: { id: existing.id },
        data: data as Prisma.AdGroupSnapshotUncheckedUpdateInput,
      });
    } else {
      await prisma.adGroupSnapshot.create({
        data: data as Prisma.AdGroupSnapshotUncheckedCreateInput,
      });
    }
    n += 1;
  }
  return n;
}

async function upsertAds(
  connection: MarketingPlatformConnection,
  rows: SyncAdSnapshot[]
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const existing = await prisma.adSnapshot.findFirst({
      where: { connectionId: connection.id, adId: r.adId, date: r.date },
      select: { id: true },
    });
    const data = {
      connectionId: connection.id,
      platform: connection.platform,
      accountId: connection.accountId ?? null,
      date: r.date,
      campaignId: r.campaignId ?? null,
      campaignName: r.campaignName ?? null,
      adGroupId: r.adGroupId ?? null,
      adGroupName: r.adGroupName ?? null,
      adId: r.adId,
      adName: r.adName ?? null,
      creativeName: r.creativeName ?? null,
      placement: r.placement ?? null,
      country: r.country ?? null,
      spend: r.spend ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      reportedConversions: r.reportedConversions ?? 0,
      reportedConversionValue: r.reportedConversionValue ?? 0,
      currency: r.currency ?? connection.defaultCurrency ?? null,
      raw: (r.raw ?? null) as Prisma.InputJsonValue | null,
    };
    if (existing) {
      await prisma.adSnapshot.update({
        where: { id: existing.id },
        data: data as Prisma.AdSnapshotUncheckedUpdateInput,
      });
    } else {
      await prisma.adSnapshot.create({
        data: data as Prisma.AdSnapshotUncheckedCreateInput,
      });
    }
    n += 1;
  }
  return n;
}

async function upsertMessaging(
  connection: MarketingPlatformConnection,
  rows: SyncMessagingSnapshot[]
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const existing = await prisma.marketingCampaignSnapshot.findFirst({
      where: {
        connectionId: connection.id,
        provider: r.provider,
        channel: r.channel,
        templateId: r.templateId ?? null,
        date: r.date,
      },
      select: { id: true },
    });
    const data = {
      connectionId: connection.id,
      provider: r.provider,
      channel: r.channel,
      campaignId: r.campaignId ?? null,
      campaignName: r.campaignName ?? null,
      templateId: r.templateId ?? null,
      templateName: r.templateName ?? null,
      messageVariant: r.messageVariant ?? null,
      audienceSegment: r.audienceSegment ?? null,
      date: r.date,
      sent: r.sent ?? 0,
      delivered: r.delivered ?? 0,
      failed: r.failed ?? 0,
      opened: r.opened ?? 0,
      clicked: r.clicked ?? 0,
      replied: r.replied ?? 0,
      donations: r.donations ?? 0,
      revenue: r.revenue ?? 0,
      cost: r.cost ?? 0,
      currency: r.currency ?? null,
      raw: (r.raw ?? null) as Prisma.InputJsonValue | null,
    };
    if (existing) {
      await prisma.marketingCampaignSnapshot.update({
        where: { id: existing.id },
        data: data as Prisma.MarketingCampaignSnapshotUncheckedUpdateInput,
      });
    } else {
      await prisma.marketingCampaignSnapshot.create({
        data: data as Prisma.MarketingCampaignSnapshotUncheckedCreateInput,
      });
    }
    n += 1;
  }
  return n;
}
