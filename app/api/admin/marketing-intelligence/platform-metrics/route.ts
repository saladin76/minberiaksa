import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;
type Platform = "META" | "GOOGLE_ADS" | "TIKTOK" | "X" | "GA4" | "OTHER";
type Level = "ACCOUNT" | "CAMPAIGN" | "ADSET" | "AD" | "SOURCE";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function platformValue(value: unknown): Platform {
  const raw = readString(value)?.toUpperCase();
  if (raw === "META" || raw === "GOOGLE_ADS" || raw === "TIKTOK" || raw === "X" || raw === "GA4") return raw;
  return "OTHER";
}

function levelValue(value: unknown): Level {
  const raw = readString(value)?.toUpperCase();
  if (raw === "ACCOUNT" || raw === "CAMPAIGN" || raw === "ADSET" || raw === "AD" || raw === "SOURCE") return raw;
  return "CAMPAIGN";
}

function dateKey(value: unknown) {
  const raw = readString(value);
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function metricKey(row: JsonMap) {
  const parts = [
    platformValue(row.platform),
    dateKey(row.date),
    levelValue(row.level),
    readString(row.accountId) || "",
    readString(row.campaignId) || "",
    readString(row.adsetId) || readString(row.adGroupId) || "",
    readString(row.adId) || "",
    readString(row.source) || "",
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

async function ensureIndexes() {
  await prisma.$runCommandRaw({
    createIndexes: "MarketingPlatformDailyMetric",
    indexes: [
      { key: { date: -1, platform: 1 }, name: "date_platform" },
      { key: { platform: 1, level: 1, date: -1 }, name: "platform_level_date" },
      { key: { campaignId: 1, date: -1 }, name: "campaign_date" },
      { key: { adId: 1, date: -1 }, name: "ad_date" },
      { key: { metricKey: 1 }, name: "metricKey_unique", unique: true },
    ],
  }).catch(() => null);
}

function normalizeMetric(input: JsonMap) {
  const platform = platformValue(input.platform);
  const level = levelValue(input.level);
  const date = dateKey(input.date);
  const spend = readNumber(input.spend);
  const revenue = readNumber(input.revenue);
  const conversions = readNumber(input.conversions);
  const clicks = readNumber(input.clicks);
  const impressions = readNumber(input.impressions);
  const document = {
    metricKey: metricKey(input),
    platform,
    level,
    date,
    accountId: readString(input.accountId) || null,
    accountName: readString(input.accountName) || null,
    campaignId: readString(input.campaignId) || null,
    campaignName: readString(input.campaignName) || null,
    adsetId: readString(input.adsetId) || readString(input.adGroupId) || null,
    adsetName: readString(input.adsetName) || readString(input.adGroupName) || null,
    adId: readString(input.adId) || null,
    adName: readString(input.adName) || null,
    source: readString(input.source) || null,
    medium: readString(input.medium) || null,
    currency: readString(input.currency)?.toUpperCase() || "USD",
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? revenue / spend : 0,
    raw: input,
    updatedAt: new Date(),
  };
  return document;
}

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  await ensureIndexes();
  const limit = numberParam(request, "limit", 100, 1, 1000);
  const platform = readString(request.nextUrl.searchParams.get("platform"))?.toUpperCase();
  const level = readString(request.nextUrl.searchParams.get("level"))?.toUpperCase();
  const dateFrom = readString(request.nextUrl.searchParams.get("dateFrom"));
  const dateTo = readString(request.nextUrl.searchParams.get("dateTo"));
  const filter: JsonMap = {};
  if (platform && platform !== "ALL") filter.platform = platform;
  if (level && level !== "ALL") filter.level = level;
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) (filter.date as JsonMap).$gte = dateFrom;
    if (dateTo) (filter.date as JsonMap).$lte = dateTo;
  }

  const result = await prisma.$runCommandRaw({
    find: "MarketingPlatformDailyMetric",
    filter,
    sort: { date: -1, updatedAt: -1 },
    limit,
  }) as JsonMap;
  const rows = typeof result.cursor === "object" && result.cursor && Array.isArray((result.cursor as JsonMap).firstBatch) ? (result.cursor as JsonMap).firstBatch : [];

  const summary = rows.reduce((acc, row) => {
    if (typeof row === "object" && row) {
      const r = row as JsonMap;
      acc.spend += readNumber(r.spend);
      acc.impressions += readNumber(r.impressions);
      acc.clicks += readNumber(r.clicks);
      acc.conversions += readNumber(r.conversions);
      acc.revenue += readNumber(r.revenue);
    }
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

  return NextResponse.json({ ok: true, rows, summary: { ...summary, roas: summary.spend > 0 ? summary.revenue / summary.spend : 0, cpa: summary.conversions > 0 ? summary.spend / summary.conversions : 0 } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  await ensureIndexes();
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray((body as JsonMap).rows) ? (body as JsonMap).rows : [body];
  const normalized = rows.filter((row): row is JsonMap => typeof row === "object" && row !== null && !Array.isArray(row)).map(normalizeMetric);
  if (normalized.length === 0) return NextResponse.json({ ok: false, error: "missing rows" }, { status: 400 });

  const now = new Date();
  const updates = normalized.map((document) => ({
    q: { metricKey: document.metricKey },
    u: { $set: document, $setOnInsert: { createdAt: now } },
    upsert: true,
  }));

  const result = await prisma.$runCommandRaw({ update: "MarketingPlatformDailyMetric", updates }) as JsonMap;
  return NextResponse.json({ ok: true, count: normalized.length, result });
}
