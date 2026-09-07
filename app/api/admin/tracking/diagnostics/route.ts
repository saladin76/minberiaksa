import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SETTINGS_COLLECTION = "TrackingSettings";
const EVENTS_COLLECTION = "ConversionEvent";

type Platform = "meta" | "ga4" | "google_ads" | "tiktok" | "x";
type EventPlatform = "META" | "GA4" | "GOOGLE_ADS" | "TIKTOK" | "X";

const platformMap: Record<Platform, EventPlatform> = {
  meta: "META",
  ga4: "GA4",
  google_ads: "GOOGLE_ADS",
  tiktok: "TIKTOK",
  x: "X",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(row: Record<string, unknown> | null, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function present(row: Record<string, unknown> | null, key: string): boolean {
  return Boolean(text(row, key));
}

async function getSettings(): Promise<Record<string, unknown> | null> {
  const result = await prisma.$runCommandRaw({ find: SETTINGS_COLLECTION, limit: 1, sort: { createdAt: 1 } });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return (batch[0] as Record<string, unknown> | undefined) ?? null;
}

async function latestEvent(platform: EventPlatform, channel?: "browser" | "server") {
  const query: Record<string, unknown> = { platform };
  if (channel) query.channel = channel;
  const result = await prisma.$runCommandRaw({
    find: EVENTS_COLLECTION,
    filter: query,
    sort: { updatedAt: -1, createdAt: -1 },
    limit: 1,
    projection: { request: 0, response: 0 },
  });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return (batch[0] as Record<string, unknown> | undefined) ?? null;
}

function status(configured: boolean, label: string) {
  return configured ? { state: "ok", label } : { state: "missing", label: "ناقص" };
}

function eventDate(event: Record<string, unknown> | null): string | null {
  const value = event?.updatedAt ?? event?.createdAt ?? event?.sentAt;
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$date === "string") return value.$date;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function eventError(event: Record<string, unknown> | null): string | null {
  const value = event?.error;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventSummary(event: Record<string, unknown> | null) {
  if (!event) return null;
  return {
    eventName: typeof event.eventName === "string" ? event.eventName : null,
    eventId: typeof event.eventId === "string" ? event.eventId : null,
    status: typeof event.status === "string" ? event.status : null,
    channel: typeof event.channel === "string" ? event.channel : null,
    updatedAt: eventDate(event),
    error: eventError(event),
  };
}

function buildDiagnostics(row: Record<string, unknown> | null, platform: Platform, browserFields: string[], serverFields: string[]) {
  const browserMissing = browserFields.filter((field) => !present(row, field));
  const serverMissing = serverFields.filter((field) => !present(row, field));
  return {
    platform,
    browser: { ...status(browserMissing.length === 0, "جاهز"), missingFields: browserMissing },
    server: serverFields.length === 0
      ? { state: "not_required", label: "غير مطلوب", missingFields: [] as string[] }
      : { ...status(serverMissing.length === 0, "جاهز"), missingFields: serverMissing },
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "pixels");
    if (denied) return denied;

    const row = await getSettings();
    const base = {
      meta: buildDiagnostics(row, "meta", ["facebookPixelId"], ["facebookAccessToken"]),
      ga4: buildDiagnostics(row, "ga4", ["gaMeasurementId"], ["gaApiSecret"]),
      google_ads: buildDiagnostics(row, "google_ads", ["googleAdsConversionId", "googleAdsConversionLabel"], []),
      tiktok: buildDiagnostics(row, "tiktok", ["tiktokPixelId"], ["tiktokAccessToken"]),
      x: buildDiagnostics(row, "x", ["xPixelId"], ["xAccessToken", "xAdAccountId"]),
    };

    const entries = await Promise.all((Object.keys(base) as Platform[]).map(async (platform) => {
      const eventPlatform = platformMap[platform];
      const [anyEvent, browserEvent, serverEvent] = await Promise.all([
        latestEvent(eventPlatform),
        latestEvent(eventPlatform, "browser"),
        latestEvent(eventPlatform, "server"),
      ]);
      return [platform, { ...base[platform], latest: eventSummary(anyEvent), latestBrowser: eventSummary(browserEvent), latestServer: eventSummary(serverEvent) }];
    }));

    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), diagnostics: Object.fromEntries(entries) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[tracking] diagnostics failed", error);
    return NextResponse.json({ ok: false, error: "Failed to build tracking diagnostics" }, { status: 500 });
  }
}
