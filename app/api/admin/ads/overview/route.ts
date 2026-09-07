import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import {
  aggregateBreakdown,
  computeOverview,
} from "@/lib/attribution/aggregate";
import { computeRecommendations } from "@/lib/ads/recommendations";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "ads");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const { donations, range } = await fetchAdsDonations({
      period: sp.get("period") || "month",
      startParam: sp.get("start"),
      endParam: sp.get("end"),
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      country: sp.get("country"),
    });

    const overview = computeOverview(donations);
    const recommendations = computeRecommendations({
      platforms: aggregateBreakdown(donations, "platform"),
      campaigns: aggregateBreakdown(donations, "campaign"),
      ads: aggregateBreakdown(donations, "ad"),
      countries: aggregateBreakdown(donations, "country").filter(
        (r) => r.key !== "__unset"
      ),
      placements: aggregateBreakdown(donations, "placement"),
      totalRevenueUSD: overview.totalRevenueUSD,
      paidAdCount: overview.paidAdCount,
    });

    return NextResponse.json({
      ...overview,
      recommendations,
      range: {
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
      },
    });
  } catch (error) {
    console.error("Error fetching ads overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch ads overview" },
      { status: 500 }
    );
  }
}
