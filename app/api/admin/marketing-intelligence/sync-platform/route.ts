import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { runSyncJob, type PlatformSelector } from "@/lib/marketing/sync";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["meta", "google_ads", "tiktok", "x", "ga4", "twilio", "all"]);

function normalizePlatform(value: unknown): PlatformSelector {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "meta";
  return (ALLOWED.has(text) ? text : "meta") as PlatformSelector;
}

function clampDays(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, Math.floor(n)));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function range(days: number) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const platform = normalizePlatform(body.platform ?? request.nextUrl.searchParams.get("platform"));
  const days = clampDays(body.days ?? request.nextUrl.searchParams.get("days"));
  const connectionId = typeof body.connectionId === "string" && body.connectionId.trim() ? body.connectionId.trim() : undefined;
  const { from, to } = range(days);

  const outcome = await runSyncJob({
    platform,
    connectionId,
    dateFrom: from,
    dateTo: to,
    triggeredBy: session?.user?.id ?? null,
  });

  return NextResponse.json({
    ok: outcome.ok,
    status: outcome.status,
    platform,
    range: { from: dateKey(from), to: dateKey(to), days },
    results: outcome.results,
  }, { headers: { "Cache-Control": "no-store" } });
}
