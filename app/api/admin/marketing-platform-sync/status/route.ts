import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set([
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "MISSING_CONFIG",
  "NOT_IMPLEMENTED",
  "PARTIAL_SUCCESS",
]);

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const platform = sp.get("platform");
  const connectionId = sp.get("connectionId");
  const status = sp.get("status");
  const dateFromStr = sp.get("dateFrom");
  const dateToStr = sp.get("dateTo");

  const where: Prisma.PlatformSyncRunWhereInput = {};
  if (platform && platform !== "all") where.platform = platform.toUpperCase();
  if (connectionId) where.connectionId = connectionId;
  if (status && VALID_STATUSES.has(status)) where.status = status;
  if (dateFromStr && /^\d{4}-\d{2}-\d{2}$/.test(dateFromStr)) {
    where.startedAt = { ...(where.startedAt as object), gte: new Date(`${dateFromStr}T00:00:00.000Z`) };
  }
  if (dateToStr && /^\d{4}-\d{2}-\d{2}$/.test(dateToStr)) {
    where.startedAt = { ...(where.startedAt as object), lte: new Date(`${dateToStr}T23:59:59.999Z`) };
  }

  const runs = await prisma.platformSyncRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  // Hydrate connection names (best-effort — connections may be archived).
  const connectionIds = Array.from(
    new Set(runs.map((r) => r.connectionId).filter((v): v is string => !!v))
  );
  const connections = connectionIds.length
    ? await prisma.marketingPlatformConnection.findMany({
        where: { id: { in: connectionIds } },
        select: { id: true, name: true, platform: true },
      })
    : [];
  const nameById = new Map(connections.map((c) => [c.id, c.name]));

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      connectionName: r.connectionId ? nameById.get(r.connectionId) ?? null : null,
      platform: r.platform,
      accountId: r.accountId,
      dateFrom: r.dateFrom.toISOString(),
      dateTo: r.dateTo.toISOString(),
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      rowsFetched: r.rowsFetched,
      error: r.error,
      metadata: r.metadata,
    })),
  });
}
