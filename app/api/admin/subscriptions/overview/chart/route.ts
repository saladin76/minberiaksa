import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  getIstanbulDateRange,
  resolveChartStartKey,
} from '@/lib/admin/istanbul-calendar';
import {
  donationFrequencyWhere,
  loadSubscriptionFrequencies,
  parseFrequencyParam,
} from "@/lib/dashboard/recurring-frequency-filter";

/**
 * GET /api/admin/subscriptions/overview/chart  time series for donations linked to recurring
 * plans only. `?frequency=DAILY|FRIDAY|MONTHLY` narrows to one cadence; every point also
 * carries the split by cadence (`amountDaily` / `amountFriday` / `amountMonthlyPlan`) so the
 * chart can stack them.
 *
 * `amountMonthly` / `countMonthly` keep their historical name but mean "all recurring charges"
 *  they predate daily and Friday plans, when every recurring charge was monthly.
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
    const period = searchParams.get("period") || "month";
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const referralIdParam = searchParams.get("referralId");
    const frequency = parseFrequencyParam(searchParams.get("frequency"));

    if (referralIdParam) {
      const ref = await prisma.referral.findUnique({ where: { id: referralIdParam }, select: { id: true } });
      if (!ref) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }
    }

    const { startDate, endDate, startDateKey, endDateKey, isAllTime } = getIstanbulDateRange(period, startParam, endParam);

    // Bucket by `paidAt` so a subscription renewal settled at 00:30 Istanbul
    // lands in the new day's bar, not the prior evening's.
    // status=PAID alone includes abandoned checkouts that never settled; require paidAt too.
    const whereClause: Prisma.DonationWhereInput = {
      subscriptionId: { not: null },
      paidAt: { gte: startDate, lte: endDate },
      status: "PAID",
      ...donationFrequencyWhere(frequency),
    };

    if (referralIdParam) {
      whereClause.referralId = referralIdParam;
    }

    if (userId && userId !== "all") {
      whereClause.donorId = userId;
    }

    if (campaignId && campaignId !== "all") {
      whereClause.items = { some: { campaignId } };
    } else if (categoryId && categoryId !== "all") {
      whereClause.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    const donations = await prisma.donation.findMany({
      where: whereClause,
      select: {
        createdAt: true,
        paidAt: true,
        subscriptionId: true,
        teamSupport: true,
        fees: true,
        amountUSD: true,
        totalAmount: true,
        amount: true,
      },
    });

    const frequencyOf = await loadSubscriptionFrequencies(
      prisma,
      donations.map((d) => d.subscriptionId).filter((id): id is string => Boolean(id))
    );

    type Bucket = {
      amountMonthly: number;
      countMonthly: number;
      amountDaily: number;
      countDaily: number;
      amountFriday: number;
      countFriday: number;
      amountMonthlyPlan: number;
      countMonthlyPlan: number;
      teamSupport: number;
      fees: number;
    };
    const emptyBucket = (): Bucket => ({
      amountMonthly: 0,
      countMonthly: 0,
      amountDaily: 0,
      countDaily: 0,
      amountFriday: 0,
      countFriday: 0,
      amountMonthlyPlan: 0,
      countMonthlyPlan: 0,
      teamSupport: 0,
      fees: 0,
    });
    const byDate = new Map<string, Bucket>();

    for (const d of donations) {
      // WHERE clause guarantees paidAt is not null here.
      const dateStr = formatIstanbulDateKey((d.paidAt ?? d.createdAt) as Date);
      const bucket = byDate.get(dateStr) ?? emptyBucket();
      const amount = Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
      bucket.amountMonthly += amount;
      bucket.countMonthly += 1;
      const f = frequencyOf(d.subscriptionId);
      if (f === "DAILY") {
        bucket.amountDaily += amount;
        bucket.countDaily += 1;
      } else if (f === "FRIDAY") {
        bucket.amountFriday += amount;
        bucket.countFriday += 1;
      } else {
        bucket.amountMonthlyPlan += amount;
        bucket.countMonthlyPlan += 1;
      }
      bucket.teamSupport += Number(d.teamSupport ?? 0);
      bucket.fees += Number(d.fees ?? 0);
      byDate.set(dateStr, bucket);
    }

    const round = (n: number) => Number(n.toFixed(2));
    const filledChartData: Array<
      {
        date: string;
        amountUSD: number;
        count: number;
        amountOneTime: number;
        countOneTime: number;
      } & Bucket
    > = [];

    /* All-time queries from the epoch, so the axis starts at the first day with data rather than
       at 1970  see `resolveChartStartKey`. Bounded periods are unchanged. */
    const axisStartKey = resolveChartStartKey(isAllTime, startDateKey, endDateKey, byDate.keys());

    for (const dateStr of eachIstanbulDateKey(axisStartKey, endDateKey)) {
      const b = byDate.get(dateStr) ?? emptyBucket();
      filledChartData.push({
        date: dateStr,
        amountUSD: round(b.amountMonthly),
        count: b.countMonthly,
        amountOneTime: 0,
        countOneTime: 0,
        amountMonthly: round(b.amountMonthly),
        countMonthly: b.countMonthly,
        amountDaily: round(b.amountDaily),
        countDaily: b.countDaily,
        amountFriday: round(b.amountFriday),
        countFriday: b.countFriday,
        amountMonthlyPlan: round(b.amountMonthlyPlan),
        countMonthlyPlan: b.countMonthlyPlan,
        teamSupport: round(b.teamSupport),
        fees: round(b.fees),
      });
    }

    return NextResponse.json(filledChartData);
  } catch (error) {
    console.error("Error fetching subscription chart data:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription chart data", details: (error as Error).message },
      { status: 500 }
    );
  }
}
