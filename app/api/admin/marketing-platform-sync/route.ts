import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { runSyncJob, type PlatformSelector } from "@/lib/marketing/sync";

const PLATFORM_SELECTORS = [
  "meta",
  "google_ads",
  "tiktok",
  "x",
  "ga4",
  "twilio",
  "all",
] as const satisfies readonly PlatformSelector[];

const schema = z.object({
  platform: z.enum(PLATFORM_SELECTORS),
  connectionId: z.string().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { platform, connectionId, dateFrom, dateTo } = parsed.data;
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T23:59:59.999Z`);
  if (!(from instanceof Date) || isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const outcome = await runSyncJob({
    platform,
    connectionId,
    dateFrom: from,
    dateTo: to,
    triggeredBy: actor.actorId,
  });

  return NextResponse.json({
    ok: outcome.ok,
    status: outcome.status,
    results: outcome.results.map((r) => ({
      runId: r.runId,
      connectionId: r.connectionId,
      platform: r.platform,
      status: r.status,
      rowsFetched: r.rowsFetched,
      missingRequiredFields: r.missingRequiredFields,
      message: r.message,
      error: r.error ?? null,
    })),
  });
}
