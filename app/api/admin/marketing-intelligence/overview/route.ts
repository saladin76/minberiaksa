import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

type PlatformRow = {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  currency: string | null;
};

type CampaignRow = PlatformRow & {
  campaignId: string | null;
  campaignName: string | null;
};

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function daysParam(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days") || 7);
  return Number.isFinite(raw) ? Math.max(1, Math.min(90, Math.floor(raw))) : 7;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function aggregateSnapshotPlatforms(from: Date, to: Date): Promise<PlatformRow[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: "AdCampaignSnapshot",
    pipeline: [
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: {
        _id: { platform: "$platform", currency: "$currency" },
        spend: { $sum: "$spend" },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        conversions: { $sum: "$reportedConversions" },
        revenue: { $sum: "$reportedConversionValue" },
      } },
      { $sort: { spend: -1 } },
    ],
    cursor: {},
  }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return rows.map((row) => {
    const id = isMap(row._id) ? row._id : {};
    return {
      platform: str(id.platform) ?? "UNKNOWN",
      currency: str(id.currency),
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      conversions: num(row.conversions),
      revenue: num(row.revenue),
    };
  });
}

async function aggregateSnapshotCampaigns(from: Date, to: Date): Promise<CampaignRow[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: "AdCampaignSnapshot",
    pipeline: [
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: {
        _id: { platform: "$platform", campaignId: "$campaignId", campaignName: "$campaignName", currency: "$currency" },
        spend: { $sum: "$spend" },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        conversions: { $sum: "$reportedConversions" },
        revenue: { $sum: "$reportedConversionValue" },
      } },
      { $sort: { spend: -1 } },
      { $limit: 20 },
    ],
    cursor: {},
  }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return rows.map((row) => {
    const id = isMap(row._id) ? row._id : {};
    return {
      platform: str(id.platform) ?? "UNKNOWN",
      campaignId: str(id.campaignId),
      campaignName: str(id.campaignName),
      currency: str(id.currency),
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      conversions: num(row.conversions),
      revenue: num(row.revenue),
    };
  });
}

async function aggregateDailyMetrics(fromKey: string, toKey: string): Promise<PlatformRow[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: "MarketingPlatformDailyMetric",
    pipeline: [
      { $match: { date: { $gte: fromKey, $lte: toKey } } },
      { $group: {
        _id: { platform: "$platform", currency: "$currency" },
        spend: { $sum: "$spend" },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        conversions: { $sum: "$conversions" },
        revenue: { $sum: "$revenue" },
      } },
      { $sort: { spend: -1 } },
    ],
    cursor: {},
  }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return rows.map((row) => {
    const id = isMap(row._id) ? row._id : {};
    return {
      platform: str(id.platform) ?? "UNKNOWN",
      currency: str(id.currency),
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      conversions: num(row.conversions),
      revenue: num(row.revenue),
    };
  });
}

function mergePlatformRows(a: PlatformRow[], b: PlatformRow[]) {
  const map = new Map<string, PlatformRow>();
  for (const row of [...a, ...b]) {
    const key = `${row.platform}:${row.currency ?? ""}`;
    const current = map.get(key) ?? { platform: row.platform, currency: row.currency, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    current.spend += row.spend;
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    current.revenue += row.revenue;
    map.set(key, current);
  }
  return [...map.values()].sort((x, y) => y.spend - x.spend);
}

function isAdAttributed(attribution: unknown) {
  if (!isMap(attribution)) return false;
  const source = str(attribution.utm_source) ?? str(attribution.source) ?? str(attribution.channel);
  const medium = str(attribution.utm_medium);
  const clickId = str(attribution.fbclid) ?? str(attribution.gclid) ?? str(attribution.ttclid) ?? str(attribution.twclid);
  if (clickId) return true;
  const normalized = `${source ?? ""} ${medium ?? ""}`.toLowerCase();
  return ["meta", "facebook", "instagram", "google", "tiktok", "paid", "ads", "cpc", "paid_social"].some((token) => normalized.includes(token));
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = daysParam(request);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const [snapshotPlatforms, dailyPlatforms, campaigns, connections, syncRuns, donations] = await Promise.all([
    aggregateSnapshotPlatforms(from, to),
    aggregateDailyMetrics(dateOnly(from), dateOnly(to)),
    aggregateSnapshotCampaigns(from, to),
    prisma.marketingPlatformConnection.findMany({
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      select: { id: true, platform: true, name: true, accountId: true, accountName: true, status: true, enabled: true, lastSyncAt: true, lastError: true, defaultCurrency: true },
      take: 50,
    }).catch(() => []),
    prisma.platformSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      select: { id: true, platform: true, accountId: true, status: true, rowsFetched: true, error: true, startedAt: true, finishedAt: true },
      take: 12,
    }).catch(() => []),
    prisma.donation.findMany({
      where: { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER },
      select: { id: true, amount: true, amountUSD: true, totalAmount: true, currency: true, createdAt: true, attribution: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const platformRows = mergePlatformRows(snapshotPlatforms, dailyPlatforms);
  const totalSpend = platformRows.reduce((sum, row) => sum + row.spend, 0);
  const platformRevenue = platformRows.reduce((sum, row) => sum + row.revenue, 0);
  const platformConversions = platformRows.reduce((sum, row) => sum + row.conversions, 0);
  const platformClicks = platformRows.reduce((sum, row) => sum + row.clicks, 0);
  const platformImpressions = platformRows.reduce((sum, row) => sum + row.impressions, 0);

  const adDonations = donations.filter((donation) => isAdAttributed(donation.attribution));
  const siteRevenue = adDonations.reduce((sum, donation) => sum + donationRowUsdApprox(donation), 0);
  const allSiteRevenue = donations.reduce((sum, donation) => sum + donationRowUsdApprox(donation), 0);

  const activeConnections = connections.filter((c) => c.enabled).length;
  const successSyncs = syncRuns.filter((run) => run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS").length;
  const failedSyncs = syncRuns.filter((run) => run.status === "FAILED" || run.status === "MISSING_CONFIG" || run.status === "NOT_IMPLEMENTED").length;

  return NextResponse.json({
    ok: true,
    range: { days, from: dateOnly(from), to: dateOnly(to) },
    summary: {
      spend: totalSpend,
      platformRevenue,
      platformConversions,
      platformClicks,
      platformImpressions,
      siteRevenue,
      allSiteRevenue,
      siteDonations: adDonations.length,
      allPaidDonations: donations.length,
      platformRoas: totalSpend > 0 ? platformRevenue / totalSpend : 0,
      siteRoas: totalSpend > 0 ? siteRevenue / totalSpend : 0,
      activeConnections,
      totalConnections: connections.length,
      successSyncs,
      failedSyncs,
    },
    platforms: platformRows,
    campaigns,
    connections: connections.map((c) => ({
      id: c.id,
      platform: c.platform,
      name: c.name,
      accountId: c.accountId,
      accountName: c.accountName,
      status: c.status,
      enabled: c.enabled,
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
      defaultCurrency: c.defaultCurrency,
    })),
    syncRuns,
  }, { headers: { "Cache-Control": "no-store" } });
}
