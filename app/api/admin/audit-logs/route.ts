import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "logs");
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const stream = searchParams.get("stream");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "100", 10) || 100,
      500
    );
    const skip = (page - 1) * limit;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // This page answers "who did what". Rows written by cron jobs and server
    // pipelines carry `actorRole: "SYSTEM"` and no actor — the scheduler
    // heartbeat, Meta CAPI tracing, automatic-message dispatch, webhook
    // reconciliation. They are excluded wholesale rather than by an action
    // deny-list, so a new automated writer can never leak into this view by
    // simply not being on the list.
    //
    // The rows are NOT deleted: `getSchedulerStatus()` reads the heartbeat to
    // show «آخر تشغيل», and the marketing conversion dashboard falls back to the
    // CAPI rows when the ConversionEvent collection is empty.
    const where: Record<string, unknown> = { actorRole: { not: "SYSTEM" } };
    if (stream === "TEAM" || stream === "DONOR") where.stream = stream;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("audit-logs GET", e);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
