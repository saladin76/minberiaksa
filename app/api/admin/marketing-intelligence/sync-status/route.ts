import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function platformParam(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform")?.trim().toUpperCase();
  return platform && platform !== "ALL" ? platform : undefined;
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const platform = platformParam(request);
  const where = platform ? { platform } : {};

  const runs = await prisma.platformSyncRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      platform: true,
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

  const latest = runs[0] ?? null;
  const lastSuccess = runs.find((run) => run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS") ?? null;
  const lastFailure = runs.find((run) => run.status === "FAILED" || run.error) ?? null;

  return NextResponse.json({
    ok: true,
    platform: platform ?? "ALL",
    latest: latest ? {
      id: latest.id,
      platform: latest.platform,
      connectionId: latest.connectionId,
      accountId: latest.accountId,
      status: latest.status,
      startedAt: iso(latest.startedAt),
      finishedAt: iso(latest.finishedAt),
      dateFrom: dateOnly(latest.dateFrom),
      dateTo: dateOnly(latest.dateTo),
      rowsFetched: latest.rowsFetched,
      error: latest.error,
    } : null,
    lastSuccess: lastSuccess ? {
      id: lastSuccess.id,
      platform: lastSuccess.platform,
      status: lastSuccess.status,
      startedAt: iso(lastSuccess.startedAt),
      finishedAt: iso(lastSuccess.finishedAt),
      dateFrom: dateOnly(lastSuccess.dateFrom),
      dateTo: dateOnly(lastSuccess.dateTo),
      rowsFetched: lastSuccess.rowsFetched,
    } : null,
    lastFailure: lastFailure ? {
      id: lastFailure.id,
      platform: lastFailure.platform,
      status: lastFailure.status,
      startedAt: iso(lastFailure.startedAt),
      finishedAt: iso(lastFailure.finishedAt),
      error: lastFailure.error,
    } : null,
    recent: runs.map((run) => ({
      id: run.id,
      platform: run.platform,
      connectionId: run.connectionId,
      accountId: run.accountId,
      status: run.status,
      startedAt: iso(run.startedAt),
      finishedAt: iso(run.finishedAt),
      dateFrom: dateOnly(run.dateFrom),
      dateTo: dateOnly(run.dateTo),
      rowsFetched: run.rowsFetched,
      error: run.error,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
