import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { runSyncJob } from "@/lib/marketing/sync";

export const dynamic = "force-dynamic";

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampDays(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, Math.floor(n)));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const days = clampDays(body.days ?? request.nextUrl.searchParams.get("days"));

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const outcome = await runSyncJob({ platform: "meta", dateFrom: from, dateTo: to, triggeredBy: session?.user?.id ?? null });
  return NextResponse.json({ ok: outcome.ok, status: outcome.status, range: { from: day(from), to: day(to), days }, results: outcome.results });
}
