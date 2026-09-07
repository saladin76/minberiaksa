import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import {
  aggregateBreakdown,
  type BreakdownDimension,
} from "@/lib/attribution/aggregate";

const VALID_DIMENSIONS: BreakdownDimension[] = [
  "platform",
  "campaign",
  "adset",
  "ad",
  "placement",
  "country",
  "device",
];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "ads");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const dimRaw = (sp.get("dimension") || "platform") as BreakdownDimension;
    const dimension: BreakdownDimension = VALID_DIMENSIONS.includes(dimRaw) ? dimRaw : "platform";

    const { donations, range } = await fetchAdsDonations({
      period: sp.get("period") || "month",
      startParam: sp.get("start"),
      endParam: sp.get("end"),
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      country: sp.get("country"),
    });

    const rows = aggregateBreakdown(donations, dimension);

    return NextResponse.json({
      dimension,
      rows,
      totalRowCount: rows.length,
      range: {
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
      },
    });
  } catch (error) {
    console.error("Error fetching ads breakdown:", error);
    return NextResponse.json(
      { error: "Failed to fetch ads breakdown" },
      { status: 500 }
    );
  }
}
