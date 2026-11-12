import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { readFunnelSummary } from "@/lib/tracking/funnel-observations";

export const dynamic = "force-dynamic";

/**
 * Aggregates only: anonymous client-reported funnel observations over 24/72h.
 * No event rows, IP hashes, user identities, receipt tokens or donor fields.
 * This does NOT establish that an event was delivered to Meta/GA4/TikTok,
 * and it cannot be interpreted as proof of payment or provider settlement.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const hours = request.nextUrl.searchParams.get("hours") === "72" ? 72 : 24;
  try {
    const summary = await readFunnelSummary(hours);
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Funnel observation source unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
