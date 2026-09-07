import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  getIstanbulDateRange,
} from "@/lib/admin/istanbul-calendar";

/** GET /api/admin/subscriptions/overview/chart — time series for donations linked to subscriptions only */
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

    if (referralIdParam) {
      const ref = await prisma.referral.findUnique({ where: { id: referralIdParam }, select: { id: true } });
      if (!ref) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }
    }

    const { startDate, endDate, startDateKey, endDateKey } = getIstanbulDateRange(period, startParam, endParam);

    // Bucket by `paidAt` so a subscription renewal settled at 00:30 Istanbul
    // lands in the new day's bar, not the prior evening's.
    // status=PAID alone includes abandoned checkouts that never settled; require paidAt too.
    const whereClause: {
      subscriptionId: { not: null };
      paidAt: { gte: Date; lte: Date };
      status: "PAID";
      referralId?: string;
      donorId?: string;
      items?: { some: { campaignId: string } };
      OR?: Array<
        | { items: { some: { campaign: { categoryIds: { has: string } } } } }
        | { categoryItems: { some: { categoryId: string } } }
      >;
    } = {
      subscriptionId: { not: null },
      paidAt: { gte: startDate, lte: endDate },
      status: "PAID",
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
        items: { select: { amount: true, amountUSD: true } },
        categoryItems: { select: { amount: true, amountUSD: true } },
      },
    });

    type Bucket = {
      amountOneTime: number;
      countOneTime: number;
      amountMonthly: number;
      countMonthly: number;
      teamSupport: number;
      fees: number;
    };
    const byDate = new Map<string, Bucket>();

    for (const d of donations) {
      // WHERE clause guarantees paidAt is not null here.
      const dateStr = formatIstanbulDateKey((d.paidAt ?? d.createdAt) as Date);
      const bucket = byDate.get(dateStr) ?? {
        amountOneTime: 0,
        countOneTime: 0,
        amountMonthly: 0,
        countMonthly: 0,
        teamSupport: 0,
        fees: 0,
      };
      const amount = Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
      bucket.amountMonthly += amount;
      bucket.countMonthly += 1;
      bucket.teamSupport += Number(d.teamSupport ?? 0);
      bucket.fees += Number(d.fees ?? 0);
      byDate.set(dateStr, bucket);
    }

    const filledChartData: {
      date: string;
      amountUSD: number;
      count: number;
      amountOneTime: number;
      countOneTime: number;
      amountMonthly: number;
      countMonthly: number;
      teamSupport: number;
      fees: number;
    }[] = [];

    for (const dateStr of eachIstanbulDateKey(startDateKey, endDateKey)) {
      const b = byDate.get(dateStr);
      const amountOneTime = 0;
      const amountMonthly = b ? Number(Number(b.amountMonthly).toFixed(2)) : 0;
      const countOneTime = 0;
      const countMonthly = b?.countMonthly ?? 0;
      const teamSupport = b ? Number(Number(b.teamSupport).toFixed(2)) : 0;
      const fees = b ? Number(Number(b.fees).toFixed(2)) : 0;

      filledChartData.push({
        date: dateStr,
        amountUSD: Number((amountOneTime + amountMonthly).toFixed(2)),
        count: countOneTime + countMonthly,
        amountOneTime,
        countOneTime,
        amountMonthly,
        countMonthly,
        teamSupport,
        fees,
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
