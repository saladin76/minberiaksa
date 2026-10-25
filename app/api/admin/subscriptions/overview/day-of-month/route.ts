import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { buildDayOfMonthFilters } from "@/lib/dashboard/day-of-month-filters";
import { loadSubscriptionFrequencies, parseFrequencyParam } from "@/lib/dashboard/recurring-frequency-filter";
import { recurringCalendarMonth, calendarDay, calendarAmountUSD, calendarOccurrences, emptyCalendar } from "@/lib/dashboard/recurring-calendar";

/** Read-only calendar projection. Expected renewals and actual settlements stay separate. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const searchParams = request.nextUrl.searchParams;
    const month = recurringCalendarMonth(searchParams.get("month"));
    if (!month) return NextResponse.json({ error: "Invalid calendar month" }, { status: 400 });
    const categoryId = searchParams.get("categoryId");
    const campaignId = searchParams.get("campaignId");
    const userId = searchParams.get("userId");
    const referralId = searchParams.get("referralId");
    const frequency = parseFrequencyParam(searchParams.get("frequency"));

    // Shared with the per-day drill-down so the list behind a cell always matches
    // the number printed on it. See lib/dashboard/day-of-month-filters.ts.
    const { donationWhere, subscriptionWhere } = buildDayOfMonthFilters({
      categoryId,
      campaignId,
      userId,
      referralId,
      frequency,
    });

    donationWhere.paidAt = { gte: month.startDate, lte: month.endDate };
    const [donations, subscriptions] = await Promise.all([
      prisma.donation.findMany({
        where: donationWhere,
        select: { paidAt: true, amountUSD: true, totalAmount: true, amount: true, currency: true },
      }),
      prisma.subscription.findMany({
        where: subscriptionWhere,
        select: { id: true, nextBillingDate: true, timezone: true, scheduleRule: true, amountUSD: true, amount: true, currency: true },
      }),
    ]);
    const frequencyOf = await loadSubscriptionFrequencies(prisma, subscriptions.map((s) => s.id));
    const collected = emptyCalendar(month);
    const expected = emptyCalendar(month);
    let missingSchedules = 0;
    let missingAmounts = 0;
    for (const donation of donations) {
      const day = calendarDay(donation.paidAt, month);
      const amount = calendarAmountUSD(donation);
      if (amount === null) { missingAmounts++; continue; }
      if (day) { collected[day - 1].amountUSD += amount; collected[day - 1].count++; }
    }
    for (const subscription of subscriptions) {
      const occurrences = calendarOccurrences({ ...subscription, frequency: frequencyOf(subscription.id) }, month);
      if (occurrences === null) { missingSchedules++; continue; }
      const amount = calendarAmountUSD(subscription);
      if (amount === null) { if (occurrences.length) missingAmounts++; continue; }
      for (const date of occurrences) {
        const day = calendarDay(date, month);
        if (day) { expected[day - 1].amountUSD += amount; expected[day - 1].count++; }
      }
    }
    for (const slot of [...collected, ...expected]) slot.amountUSD = Number(slot.amountUSD.toFixed(2));

    return NextResponse.json({
      collected,
      expected,
      month: month.month,
      missingSchedules,
      missingAmounts,
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
      { error: "Failed to fetch day-of-month revenue" },
      { status: 500 }
    );
  }
}
