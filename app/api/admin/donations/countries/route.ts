import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/admin/donations/countries
 * Returns the distinct list of donor country codes that appear on donations,
 * with per-country counts, ordered by count desc. Used to populate the
 * dashboard country-filter dropdown so admins only see options that exist.
 *
 * Optional `referralId` query narrows to one referral (for the referral page).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "revenue");
    if (denied) return denied;

    const referralId = request.nextUrl.searchParams.get("referralId");
    const where: Record<string, unknown> = {};
    if (referralId) where.referralId = referralId;

    const grouped = await prisma.donation.groupBy({
      by: ["donorCountryCode"],
      where,
      _count: { _all: true },
    });

    let unsetCount = 0;
    const countries: { code: string; count: number }[] = [];
    for (const row of grouped) {
      const code = row.donorCountryCode;
      const count = row._count?._all ?? 0;
      if (!code || !/^[A-Za-z]{2}$/.test(code)) {
        unsetCount += count;
        continue;
      }
      countries.push({ code: code.toUpperCase(), count });
    }
    countries.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    return NextResponse.json({ countries, unsetCount });
  } catch (error) {
    console.error("Error fetching donor countries:", error);
    return NextResponse.json(
      { error: "Failed to fetch donor countries", details: (error as Error).message },
      { status: 500 }
    );
  }
}
