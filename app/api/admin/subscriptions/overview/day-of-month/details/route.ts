import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  buildDayOfMonthFilters,
  donationSettlementDay,
  subscriptionBillingDay,
} from "@/lib/dashboard/day-of-month-filters";

/**
 * GET /api/admin/subscriptions/overview/day-of-month/details?day=17&mode=collected
 *
 * The rows behind ONE cell of the «الوارد حسب يوم الشهر» grid. Same two views as
 * the grid itself:
 *   - collected: the subscription donations that actually settled on that day-of-month,
 *                across every month (so day 17 lists May 17, June 17, July 17…)
 *   - expected:  the active subscriptions scheduled to bill on that day-of-month
 *
 * Filters and day-bucketing come from the same module the grid uses, so this list
 * always reconciles with the figure on the card that opened it.
 *
 * Why the day filter happens in JS: the bucket is the day in the ISTANBUL calendar,
 * and MongoDB can't express "day-of-month after a timezone shift" in a query. The
 * aggregate endpoint already loads the same rows, so this costs nothing extra.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const day = Number(sp.get("day"));
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return NextResponse.json({ error: "day must be an integer 1..31" }, { status: 400 });
    }
    const mode = sp.get("mode") === "expected" ? "expected" : "collected";

    const { donationWhere, subscriptionWhere } = buildDayOfMonthFilters({
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      userId: sp.get("userId"),
      referralId: sp.get("referralId"),
    });

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
          lastBillingDate: true,
          donor: { select: { id: true, name: true, email: true } },
          items: { select: { campaign: { select: { id: true, title: true } } } },
          categoryItems: { select: { category: { select: { id: true, name: true } } } },
          referral: { select: { id: true, code: true } },
        },
        orderBy: { amountUSD: "desc" },
      });

      const rows = subs
        .filter((s) => subscriptionBillingDay(s) === day)
        .map((s) => ({
          id: s.id,
          subscriptionId: s.id,
          status: s.status,
          amount: s.amount,
          amountUSD: s.amountUSD,
          currency: s.currency,
          createdAt: s.createdAt,
          nextBillingDate: s.nextBillingDate,
          lastBillingDate: s.lastBillingDate,
          paidAt: null as Date | null,
          donor: s.donor,
          campaigns: s.items.map((i) => i.campaign),
          categories: s.categoryItems.map((i) => i.category),
          referral: s.referral,
        }));

      return NextResponse.json({
        day,
        mode,
        rows,
        totals: {
          count: rows.length,
          amountUSD: Number(rows.reduce((t, r) => t + Number(r.amountUSD ?? r.amount ?? 0), 0).toFixed(2)),
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

    const rows = donations
      .filter((d) => donationSettlementDay(d) === day)
      .map((d) => ({
        id: d.id,
        subscriptionId: d.subscriptionId,
        status: d.subscription?.status ?? null,
        // The donation's own money is the truth for a collected row — the
        // subscription's current amount may have been edited since this charge.
        amount: d.totalAmount ?? d.amount,
        amountUSD: d.amountUSD,
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
        amountUSD: Number(rows.reduce((t, r) => t + Number(r.amountUSD ?? r.amount ?? 0), 0).toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error fetching day-of-month details:", error);
    return NextResponse.json(
      { error: "Failed to fetch day details", details: (error as Error).message },
      { status: 500 }
    );
  }
}
