import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { formatIstanbulDateKey, istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";
import { addHomeSummaryDonation, emptyHomeDonationSummary } from "@/lib/dashboard/home-donation-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "revenue");
  if (denied) return denied;
  try {
    const now = new Date();
    const today = formatIstanbulDateKey(now);
    const month = today.slice(0, 7);
    const { startDate: todayStart } = istanbulDateKeysToUtcRange(today, today);
    const { startDate: monthStart } = istanbulDateKeysToUtcRange(month + "-01", today);
    const summary = emptyHomeDonationSummary();
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.donation.findMany({
        where: { AND: [
          { OR: [{ status: "PAID", paidAt: { gte: monthStart, lte: now } }, { status: "FAILED", createdAt: { gte: monthStart, lte: now } }] },
          ...(cursor ? [{ id: { gt: cursor } }] : []),
        ] },
        orderBy: { id: "asc" }, take: 500,
        select: { id: true, status: true, paidAt: true, createdAt: true, amountUSD: true, totalAmount: true, teamSupport: true, currency: true },
      });
      for (const row of rows) addHomeSummaryDonation(summary, row, { now, todayStart, monthStart });
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
    }
    const averageUSD = summary.month.count && !summary.month.unpriced ? summary.month.amountUSD / summary.month.count : null;
    return NextResponse.json({ ...summary, averageUSD, todayKey: today, monthKey: month, timeZone: "Europe/Istanbul" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "SUMMARY_UNAVAILABLE" }, { status: 503 });
  }
}
