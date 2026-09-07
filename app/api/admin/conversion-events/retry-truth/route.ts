import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getConversionRetryTruthOverview } from "@/lib/tracking/conversion-retry-truth";

export const dynamic = "force-dynamic";

function daysParam(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days"));
  if (!Number.isFinite(raw) || raw <= 0) return 7;
  return Math.min(Math.floor(raw), 90);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const overview = await getConversionRetryTruthOverview(daysParam(request));
  return NextResponse.json({ ok: true, overview }, { headers: { "Cache-Control": "no-store" } });
}
