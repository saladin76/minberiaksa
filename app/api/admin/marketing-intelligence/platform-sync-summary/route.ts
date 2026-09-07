import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PLATFORMS = ["META", "GOOGLE_ADS", "GA4", "TIKTOK", "X", "TWILIO"];

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function summaryFor(platform: string) {
  const [connections, latest, success, failure] = await Promise.all([
    prisma.marketingPlatformConnection.findMany({
      where: { platform },
      select: { id: true, name: true, enabled: true, status: true, accountId: true, accountName: true, lastSyncAt: true, lastError: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.platformSyncRun.findFirst({ where: { platform }, orderBy: { startedAt: "desc" } }),
    prisma.platformSyncRun.findFirst({ where: { platform, status: { in: ["SUCCESS", "PARTIAL_SUCCESS"] } }, orderBy: { startedAt: "desc" } }),
    prisma.platformSyncRun.findFirst({ where: { platform, status: "FAILED" }, orderBy: { startedAt: "desc" } }),
  ]);

  return {
    platform,
    connections: connections.length,
    enabledConnections: connections.filter((c) => c.enabled).length,
    accounts: connections.map((c) => ({
      id: c.id,
      name: c.name,
      accountId: c.accountId,
      accountName: c.accountName,
      enabled: c.enabled,
      status: c.status,
      lastSyncAt: iso(c.lastSyncAt),
      lastError: c.lastError,
    })),
    latest: latest ? {
      status: latest.status,
      startedAt: iso(latest.startedAt),
      finishedAt: iso(latest.finishedAt),
      rowsFetched: latest.rowsFetched,
      error: latest.error,
      accountId: latest.accountId,
      dateFrom: iso(latest.dateFrom),
      dateTo: iso(latest.dateTo),
    } : null,
    lastSuccess: success ? {
      status: success.status,
      startedAt: iso(success.startedAt),
      finishedAt: iso(success.finishedAt),
      rowsFetched: success.rowsFetched,
      accountId: success.accountId,
    } : null,
    lastFailure: failure ? {
      status: failure.status,
      startedAt: iso(failure.startedAt),
      finishedAt: iso(failure.finishedAt),
      error: failure.error,
      accountId: failure.accountId,
    } : null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const platforms = await Promise.all(PLATFORMS.map(summaryFor));
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    platforms,
    totals: {
      platforms: platforms.length,
      connections: platforms.reduce((sum, p) => sum + p.connections, 0),
      enabledConnections: platforms.reduce((sum, p) => sum + p.enabledConnections, 0),
      successfulPlatforms: platforms.filter((p) => p.lastSuccess).length,
      failingPlatforms: platforms.filter((p) => p.latest?.status === "FAILED").length,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
