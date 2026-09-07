import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { runSyncJob, type PlatformSelector } from "@/lib/marketing/sync";

const PLATFORM_TO_SELECTOR: Record<string, PlatformSelector> = {
  META: "meta",
  GOOGLE_ADS: "google_ads",
  TIKTOK: "tiktok",
  X: "x",
  GA4: "ga4",
  TWILIO: "twilio",
};

function defaultDateRange() {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const { id } = await params;
  const row = await prisma.marketingPlatformConnection.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const selector = PLATFORM_TO_SELECTOR[row.platform];
  if (!selector) {
    return NextResponse.json({
      ok: false,
      status: "not_implemented",
      message: `لا يوجد محرك مزامنة لمنصة ${row.platform} بعد.`,
      results: [],
    });
  }

  const { from, to } = defaultDateRange();
  const actor = auditActorFromDashboardSession(session!);
  const outcome = await runSyncJob({
    platform: selector,
    connectionId: row.id,
    dateFrom: from,
    dateTo: to,
    triggeredBy: actor.actorId,
  });

  return NextResponse.json({
    ok: outcome.ok,
    status: outcome.status,
    message: outcome.results[0]?.message ?? "تم تشغيل المزامنة.",
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
