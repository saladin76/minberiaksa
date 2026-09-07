import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { runSyncJob, type PlatformSelector } from "@/lib/marketing/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const platforms = ["meta", "google_ads", "tiktok", "x", "ga4", "twilio", "all"] as const satisfies readonly PlatformSelector[];

const schema = z.object({
  platform: z.enum(platforms).default("all"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const from = new Date(`${parsed.data.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${parsed.data.dateTo}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const outcome = await runSyncJob({
    platform: parsed.data.platform,
    dateFrom: from,
    dateTo: to,
    triggeredBy: actor.actorId,
  });

  return NextResponse.json({
    ok: outcome.ok,
    status: outcome.status,
    results: outcome.results.map((result) => ({
      runId: result.runId,
      connectionId: result.connectionId,
      platform: result.platform,
      status: result.status,
      rowsFetched: result.rowsFetched,
      missingRequiredFields: result.missingRequiredFields,
      message: result.message,
      error: result.error ?? null,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
