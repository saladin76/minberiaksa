import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { buildDayOfMonthFilters } from "@/lib/dashboard/day-of-month-filters";
import {
  loadSubscriptionFrequencies,
  parseFrequencyParam,
} from "@/lib/dashboard/recurring-frequency-filter";

import { recurringCalendarMonth, calendarDay, calendarAmountUSD, calendarOccurrences } from "@/lib/dashboard/recurring-calendar";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const month = recurringCalendarMonth(sp.get("month"));
    if (!month) return NextResponse.json({ error: "Invalid calendar month" }, { status: 400 });
    const day = Number(sp.get("day"));
    if (!Number.isInteger(day) || day < 1 || day > month.days) {
      return NextResponse.json({ error: "Invalid day for selected month" }, { status: 400 });
    }
    const mode = sp.get("mode") === "expected" ? "expected" : "collected";

    const { donationWhere, subscriptionWhere } = buildDayOfMonthFilters({
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      userId: sp.get("userId"),
      referralId: sp.get("referralId"),
      frequency: parseFrequencyParam(sp.get("frequency")),
    });

    donationWhere.paidAt = { gte: month.startDate, lte: month.endDate };

    if (mode === "expected") {
      const subs = await prisma.subscription.findMany({
        where: subscriptionWhere,
        select: {
          id: true,
          status: true,
          amount: true,
          amountUSD: true,
          currency: true,
          createdAt: true,
          nextBillingDate: true,
          timezone: true,
          scheduleRule: true,
          lastBillingDate: true,
          donor: { select: { id: true, name: true, email: true } },
          items: { select: { campaign: { select: { id: true, title: true } } } },
          categoryItems: { select: { category: { select: { id: true, name: true } } } },
          referral: { select: { id: true, code: true } },
        },
        orderBy: { amountUSD: "desc" },
      });

      const frequencyOf = await loadSubscriptionFrequencies(prisma, subs.map((s) => s.id));
      const rows = subs.flatMap((s) => {
        const frequency = frequencyOf(s.id);
        const amountUSD = calendarAmountUSD(s);
        if (amountUSD === null) return [];
        const occurrences = calendarOccurrences({ ...s, frequency }, month) ?? [];
        return occurrences.filter((date) => calendarDay(date, month) === day).map((scheduledAt) => ({
          id: `${s.id}:${scheduledAt.toISOString()}`,
          subscriptionId: s.id,
          frequency,
          status: s.status,
          amount: s.amount,
          amountUSD,
          currency: s.currency,
          createdAt: s.createdAt,
          nextBillingDate: s.nextBillingDate,
          scheduledAt,
          lastBillingDate: s.lastBillingDate,
          paidAt: null as Date | null,
          donor: s.donor,
          campaigns: s.items.map((i) => i.campaign),
          categories: s.categoryItems.map((i) => i.category),
          referral: s.referral,
        }));
      });

      return NextResponse.json({
        day,
        mode,
        rows,
        totals: {
          count: rows.length,
          amountUSD: Number(rows.reduce((t, r) => t + Number(r.amountUSD ?? 0), 0).toFixed(2)),
        },
      });
    }

    const donations = await prisma.donation.findMany({
      where: donationWhere,
      select: {
        id: true,
        amount: true,
        amountUSD: true,
        totalAmount: true,
        currency: true,
        paidAt: true,
        createdAt: true,
        subscriptionId: true,
        donor: { select: { id: true, name: true, email: true } },
        items: { select: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { select: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true } },
        subscription: { select: { status: true, nextBillingDate: true, lastBillingDate: true, createdAt: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const dayDonations = donations.filter((d) => calendarDay(d.paidAt, month) === day && calendarAmountUSD(d) !== null);
    const frequencyOf = await loadSubscriptionFrequencies(
      prisma,
      dayDonations.map((d) => d.subscriptionId).filter((id): id is string => Boolean(id))
    );
    const rows = dayDonations
      .map((d) => ({
        id: d.id,
        subscriptionId: d.subscriptionId,
        frequency: frequencyOf(d.subscriptionId),
        status: d.subscription?.status ?? null,
        // The donation's own money is the truth for a collected row  the
        // subscription's current amount may have been edited since this charge.
        amount: d.totalAmount ?? d.amount,
        amountUSD: calendarAmountUSD(d),
        currency: d.currency,
        createdAt: d.subscription?.createdAt ?? d.createdAt,
        nextBillingDate: d.subscription?.nextBillingDate ?? null,
        lastBillingDate: d.subscription?.lastBillingDate ?? null,
        paidAt: d.paidAt,
        donor: d.donor,
        campaigns: d.items.map((i) => i.campaign),
        categories: d.categoryItems.map((i) => i.category),
        referral: d.referral,
      }));

    return NextResponse.json({
      day,
      mode,
      rows,
      totals: {
        count: rows.length,
        amountUSD: Number(rows.reduce((t, r) => t + Number(r.amountUSD ?? 0), 0).toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error fetching day-of-month details:", error);
    return NextResponse.json(
      { error: "Failed to fetch day details" },
      { status: 500 }
    );
  }
}
