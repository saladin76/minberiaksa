import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";
import {
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  getIstanbulDateRange,
} from "@/lib/admin/istanbul-calendar";

/** GET /api/admin/referrals/[id]/chart - Chart data for donations (transactions) attributed to this referral */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "referrals");
    if (denied) return denied;
    const { id: referralId } = await params;
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      select: { id: true },
    });
    if (!referral) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const categoryId = searchParams.get("categoryId");
    const campaignId = searchParams.get("campaignId");
    const country = searchParams.get("country")?.trim() ?? null;

    const { startDate, endDate, startDateKey, endDateKey } = getIstanbulDateRange(period, startParam, endParam);
    // Bucket by `paidAt` so a donation that settled at 00:30 Istanbul lands in
    // the new day's bar, even if its checkout row was created the prior evening.
    // status=PAID alone includes abandoned checkouts that never settled; require paidAt too.
    const donationWhere: Prisma.DonationWhereInput = {
      referralId,
      paidAt: { gte: startDate, lte: endDate },
      ...PAID_DONATION_FILTER,
    };
    if (campaignId && campaignId !== "all") {
      donationWhere.items = { some: { campaignId } };
    } else if (categoryId && categoryId !== "all") {
      donationWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }
    const countryWhere: Prisma.DonationWhereInput | null =
      country && country !== "all"
        ? country === "__unset"
          ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
          : { donorCountryCode: country.toUpperCase() }
        : null;
    const finalDonationWhere: Prisma.DonationWhereInput = countryWhere
      ? { AND: [donationWhere, countryWhere] }
      : donationWhere;

    const donations = await prisma.donation.findMany({
      where: finalDonationWhere,
      select: {
        createdAt: true,
        paidAt: true,
        subscriptionId: true,
        teamSupport: true,
        fees: true,
        amountUSD: true,
        totalAmount: true,
        amount: true,
        // Required by donationRowUsdApprox.
        currency: true,
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
      // PAID_DONATION_FILTER guarantees paidAt is not null here.
      const dateStr = formatIstanbulDateKey((d.paidAt ?? d.createdAt) as Date);
      const bucket = byDate.get(dateStr) ?? {
        amountOneTime: 0,
        countOneTime: 0,
        amountMonthly: 0,
        countMonthly: 0,
        teamSupport: 0,
        fees: 0,
      };
      // USD-labelled series must be summed in USD — see the same fix in
      // app/api/admin/donations/chart/route.ts.
      const amount = donationRowUsdApprox(d);
      if (d.subscriptionId == null) {
        bucket.amountOneTime += amount;
        bucket.countOneTime += 1;
      } else {
        bucket.amountMonthly += amount;
        bucket.countMonthly += 1;
      }
      const localTotal = Number(d.totalAmount) || 0;
      if (localTotal > 0) {
        bucket.teamSupport += amount * ((Number(d.teamSupport) || 0) / localTotal);
        bucket.fees += amount * ((Number(d.fees) || 0) / localTotal);
      }
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
      const amountOneTime = b ? Number(Number(b.amountOneTime).toFixed(2)) : 0;
      const amountMonthly = b ? Number(Number(b.amountMonthly).toFixed(2)) : 0;
      const countOneTime = b?.countOneTime ?? 0;
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
    console.error("Error fetching referral chart:", error);
    return NextResponse.json(
      { error: "Failed to fetch referral chart", details: (error as Error).message },
      { status: 500 }
    );
  }
}
