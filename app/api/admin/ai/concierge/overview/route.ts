import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { conciergeOverview, parseConciergeRange } from "@/lib/ai/concierge/analytics";
import { loadConciergeSettings } from "@/lib/ai/concierge/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/concierge/overview?days=30 | ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Everything `/dashboard/ai-concierge` draws: conversation KPIs, the daily
 * series, the funnel, breakdowns, and the donations credited to the concierge
 * (direct and indirect, see `lib/ai/concierge/analytics.ts`).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  try {
    const range = parseConciergeRange(request.nextUrl.searchParams);
    const settings = await loadConciergeSettings();
    const overview = await conciergeOverview(range, settings.attributionWindowDays);

    const donorIds = [...new Set(overview.recentDonations.map((d) => d.donorId))];
    const donors = donorIds.length
      ? await prisma.user.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true } })
      : [];
    const donorOf = new Map(donors.map((u) => [u.id, u]));
    const recentDonations = overview.recentDonations.map((d) => ({
      ...d,
      donorName: donorOf.get(d.donorId)?.name || donorOf.get(d.donorId)?.email || null,
    }));

    return NextResponse.json({ ...overview, recentDonations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/ai/concierge/overview:", error);
    return NextResponse.json({ error: "تعذّر تحميل تحليلات المساعد" }, { status: 500 });
  }
}
