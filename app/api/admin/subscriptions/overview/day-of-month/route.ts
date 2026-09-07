import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { formatIstanbulDateKey } from "@/lib/admin/istanbul-calendar";
import {
  buildDayOfMonthFilters,
  subscriptionBillingDay,
} from "@/lib/dashboard/day-of-month-filters";

/**
 * GET /api/admin/subscriptions/overview/day-of-month
 *
 * Recurring money by DAY OF THE MONTH (1..31), aggregated across every month rather than
 * within one month. A subscription renews on the same calendar day each month, so this is the
 * shape of the recurring cycle: which days of the month the money actually lands on.
 *
 * Two views, because "the recurring donations for this day in each month" can mean either:
 *   - collected: what has actually settled on that day-of-month, summed over all months
 *   - expected:  what active subscriptions are scheduled to bill on that day-of-month
 * Both are returned so the UI can toggle without a second round trip.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const campaignId = searchParams.get("campaignId");
    const userId = searchParams.get("userId");
    const referralId = searchParams.get("referralId");

    // Shared with the per-day drill-down so the list behind a cell always matches
    // the number printed on it. See lib/dashboard/day-of-month-filters.ts.
    const { donationWhere, subscriptionWhere } = buildDayOfMonthFilters({
      categoryId,
      campaignId,
      userId,
      referralId,
    });

    const [donations, subscriptions] = await Promise.all([
      prisma.donation.findMany({
        where: donationWhere,
        select: { paidAt: true, amountUSD: true, totalAmount: true, amount: true },
      }),
      prisma.subscription.findMany({
        where: subscriptionWhere,
        select: { nextBillingDate: true, lastBillingDate: true, createdAt: true, amountUSD: true, amount: true },
      }),
    ]);

    const collected = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      amountUSD: 0,
      count: 0,
      monthsObserved: 0,
    }));
    // Distinct YYYY-MM per day, so a day seen in 3 different months can report an average
    // per month instead of a total that just reflects how long the platform has been running.
    const monthsSeen: Array<Set<string>> = Array.from({ length: 31 }, () => new Set<string>());

    for (const d of donations) {
      if (!d.paidAt) continue;
      const key = formatIstanbulDateKey(d.paidAt);
      const day = Number(key.slice(8, 10));
      if (!day || day < 1 || day > 31) continue;
      const slot = collected[day - 1];
      slot.amountUSD += Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
      slot.count += 1;
      monthsSeen[day - 1].add(key.slice(0, 7));
    }
    for (let i = 0; i < 31; i++) {
      collected[i].monthsObserved = monthsSeen[i].size;
      collected[i].amountUSD = Number(collected[i].amountUSD.toFixed(2));
    }

    const expected = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      amountUSD: 0,
      count: 0,
    }));

    for (const s of subscriptions) {
      const day = subscriptionBillingDay(s);
      if (!day) continue;
      expected[day - 1].amountUSD += Number(s.amountUSD ?? s.amount ?? 0);
      expected[day - 1].count += 1;
    }
    for (let i = 0; i < 31; i++) {
      expected[i].amountUSD = Number(expected[i].amountUSD.toFixed(2));
    }

    return NextResponse.json({
      collected,
      expected,
      totals: {
        collectedUSD: Number(collected.reduce((s, d) => s + d.amountUSD, 0).toFixed(2)),
        collectedCount: collected.reduce((s, d) => s + d.count, 0),
        expectedUSD: Number(expected.reduce((s, d) => s + d.amountUSD, 0).toFixed(2)),
        expectedCount: expected.reduce((s, d) => s + d.count, 0),
      },
    });
  } catch (error) {
    console.error("Error fetching day-of-month subscription revenue:", error);
    return NextResponse.json(
      { error: "Failed to fetch day-of-month revenue", details: (error as Error).message },
      { status: 500 }
    );
  }
}
