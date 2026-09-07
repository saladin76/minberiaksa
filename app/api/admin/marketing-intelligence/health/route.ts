import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PlatformHealth = { platform: string; label: string; ready: boolean; missing: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(row: Record<string, unknown> | null, key: string) {
  const value = row?.[key];
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function platform(platform: string, label: string, fields: string[], settings: Record<string, unknown> | null): PlatformHealth {
  const missing = fields.filter((field) => !has(settings, field));
  return { platform, label, ready: missing.length === 0, missing };
}

async function getTrackingSettings() {
  const result = await prisma.$runCommandRaw({ find: "TrackingSettings", limit: 1, sort: { createdAt: 1 } });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return (batch[0] as Record<string, unknown> | undefined) ?? null;
}

async function recentConversionEvents() {
  const result = await prisma.$runCommandRaw({
    find: "ConversionEvent",
    sort: { updatedAt: -1, createdAt: -1 },
    limit: 50,
    projection: { request: 0, response: 0 },
  });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return batch as Record<string, unknown>[];
}

function eventStatus(event: Record<string, unknown>) {
  return typeof event.status === "string" ? event.status : "UNKNOWN";
}

async function latestMetaSync() {
  const run = await prisma.platformSyncRun.findFirst({
    where: { platform: "META" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      connectionId: true,
      accountId: true,
      dateFrom: true,
      dateTo: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      rowsFetched: true,
      error: true,
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    connectionId: run.connectionId,
    accountId: run.accountId,
    dateFrom: run.dateFrom.toISOString(),
    dateTo: run.dateTo.toISOString(),
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    rowsFetched: run.rowsFetched,
    error: run.error,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const settings = await getTrackingSettings();
  const platforms = [
    platform("META", "Meta Pixel + CAPI", ["facebookPixelId", "facebookAccessToken"], settings),
    platform("GA4", "Google Analytics 4", ["gaMeasurementId", "gaApiSecret"], settings),
    platform("GOOGLE_ADS", "Google Ads Conversion", ["googleAdsConversionId", "googleAdsConversionLabel"], settings),
    platform("TIKTOK", "TikTok Pixel + Events API", ["tiktokPixelId", "tiktokAccessToken"], settings),
    platform("X", "X Pixel / Conversions", ["xPixelId", "xAccessToken"], settings),
  ];

  const [paidLast7d, checkoutRowsLast7d, failedLast7d, recent, metaSync] = await Promise.all([
    prisma.donation.count({ where: { status: "PAID", paidAt: { not: null, gte: since } } }),
    prisma.donation.count({ where: { createdAt: { gte: since } } }),
    prisma.donation.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    recentConversionEvents(),
    latestMetaSync(),
  ]);

  const sent = recent.filter((event) => eventStatus(event) === "SENT").length;
  const failed = recent.filter((event) => eventStatus(event) === "FAILED").length;
  const skipped = recent.filter((event) => eventStatus(event) === "SKIPPED").length;
  const metaServerDonationIds = new Set(
    recent
      .filter((event) => event.platform === "META" && event.channel === "server" && typeof event.donationId === "string")
      .map((event) => String(event.donationId))
  );

  const recentPaidRows = await prisma.donation.findMany({
    where: { status: "PAID", paidAt: { not: null, gte: since } },
    select: { id: true },
    take: 500,
  });
  const missingServerConversions = recentPaidRows.filter((row) => !metaServerDonationIds.has(row.id)).length;

  const readiness = Math.round((platforms.filter((p) => p.ready).length / platforms.length) * 100);
  const delivery = paidLast7d === 0 ? 100 : Math.max(0, Math.round(((paidLast7d - missingServerConversions) / paidLast7d) * 100));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    window: { days: 7, since: since.toISOString() },
    scores: { readiness, delivery, overall: Math.round((readiness + delivery) / 2) },
    platforms,
    sync: { meta: metaSync },
    donations: { checkoutRowsLast7d, paidLast7d, failedLast7d, missingServerConversions },
    conversionEvents: { sentLast7d: sent, failedLast7d: failed, skippedLast7d: skipped, recent: recent.slice(0, 12) },
    links: {
      campaignBuilder: "/dashboard/link-generator",
      campaignLinksPerformance: "/dashboard/marketing-intelligence/campaign-links",
      ads: "/dashboard/ads",
      pixels: "/dashboard/pixels",
      connections: "/dashboard/marketing/connections",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
