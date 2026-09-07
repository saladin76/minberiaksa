import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentCalendarMonthIstanbulRange } from "@/lib/admin/current-calendar-month-utc";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  PAID_CONTRIBUTING_FILTER,
  donationRowUsdApprox,
  donationUsdSumFallback,
} from "@/lib/dashboard/donation-usd-revenue";
import { istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";
import { donationWhereAll } from "@/lib/donations/mongo-null";

function getDateRange(period: string, startParam?: string | null, endParam?: string | null) {
  let endDate: Date;
  let startDate: Date;
  if (startParam && endParam) {
    ({ startDate, endDate } = istanbulDateKeysToUtcRange(startParam, endParam));
  } else if (period === "all") {
    endDate = new Date();
    startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 10);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else {
    endDate = endParam ? new Date(endParam + "T23:59:59.999Z") : new Date();
    startDate = new Date(endDate);
    const days = period === "day" ? 1 : period === "week" ? 7 : 30;
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  }
  return { startDate, endDate };
}

/** Subscription-linked donation charges in range (any status — for counts & table) */
function buildDonationChargeBase(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  campaignId: string | null,
  referralId: string | null
): Prisma.DonationWhereInput {
  const base: Prisma.DonationWhereInput = {
    subscriptionId: { not: null },
    createdAt: { gte: startDate, lte: endDate },
  };
  if (referralId) base.referralId = referralId;
  if (campaignId && campaignId !== "all") {
    base.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== "all") {
    base.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  return base;
}

/**
 * Same shape as `buildDonationChargeBase`, but windowed on `paidAt` instead of `createdAt`.
 *
 * Revenue is recognised when the money actually settled, which is the rule the overview
 * chart already follows. The month card used `createdAt` + `PAID_DONATION_FILTER`, and that
 * filter's `paidAt` arm is vacuous here — it reads `paidAt != null OR subscriptionId != null`
 * while the base already requires `subscriptionId != null`, so nothing constrained settlement
 * at all. An abandoned checkout (row written optimistically at status=PAID, never settled)
 * therefore counted as revenue in the card but not in the chart, and the two disagreed.
 *
 * Windowing on `paidAt` fixes both halves at once: it recognises revenue on the settlement
 * date AND excludes unsettled rows for free, because a null `paidAt` cannot fall in a range.
 */
function buildDonationSettledBase(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  campaignId: string | null,
  referralId: string | null
): Prisma.DonationWhereInput {
  const base: Prisma.DonationWhereInput = {
    subscriptionId: { not: null },
    paidAt: { gte: startDate, lte: endDate },
  };
  if (referralId) base.referralId = referralId;
  if (campaignId && campaignId !== "all") {
    base.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== "all") {
    base.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  return base;
}

function buildDonationChargeAllTimeBase(
  categoryId: string | null,
  campaignId: string | null,
  referralId: string | null
): Prisma.DonationWhereInput {
  const base: Prisma.DonationWhereInput = { subscriptionId: { not: null } };
  if (referralId) base.referralId = referralId;
  if (campaignId && campaignId !== "all") {
    base.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== "all") {
    base.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  return base;
}

function buildSubscriptionWhere(
  categoryId: string | null,
  campaignId: string | null,
  referralId: string | null
): Prisma.SubscriptionWhereInput {
  const campaignCat: Prisma.SubscriptionWhereInput = {};
  if (campaignId && campaignId !== "all") {
    campaignCat.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== "all") {
    campaignCat.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  if (referralId && Object.keys(campaignCat).length > 0) {
    return { AND: [{ referralId }, campaignCat] };
  }
  if (referralId) return { referralId };
  return campaignCat;
}

function buildDonationItemWhereSub(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  campaignId: string | null,
  referralId: string | null
): Prisma.DonationItemWhereInput {
  // Composed with donationWhereAll: assigning `donation.OR` for the category filter used to
  // OVERWRITE the `OR` that the paid filter contributes, silently stripping the paid guard
  // so abandoned checkouts were counted as revenue whenever a category was selected.
  // Windowed on `paidAt` + strict filter for the same reason as the headline cards: these are
  // money totals, so they must agree with the chart on when revenue is recognised.
  const scoped: Prisma.DonationWhereInput = {
    subscriptionId: { not: null },
    paidAt: { gte: startDate, lte: endDate },
  };
  if (referralId) scoped.referralId = referralId;

  const byCampaign = campaignId && campaignId !== "all";
  const byCategory = !byCampaign && categoryId && categoryId !== "all";
  if (byCampaign) scoped.items = { some: { campaignId } };

  const donation = donationWhereAll(
    scoped,
    PAID_CONTRIBUTING_FILTER,
    byCategory
      ? {
          OR: [
            { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
            { categoryItems: { some: { categoryId } } },
          ],
        }
      : null
  );

  if (byCampaign) return { donation, campaignId };
  if (categoryId && categoryId !== "all") {
    return { donation, campaign: { categoryIds: { has: categoryId } } };
  }
  return { donation };
}

function buildDonationCategoryItemWhereSub(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  referralId: string | null
): Prisma.DonationCategoryItemWhereInput {
  // Same inverse-collision fix, and the same paidAt/strict windowing, as buildDonationItemWhereSub.
  const scoped: Prisma.DonationWhereInput = {
    subscriptionId: { not: null },
    paidAt: { gte: startDate, lte: endDate },
  };
  if (referralId) scoped.referralId = referralId;

  if (categoryId && categoryId !== "all") {
    const donation = donationWhereAll(scoped, PAID_CONTRIBUTING_FILTER, {
      OR: [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ],
    });
    return { donation, categoryId };
  }
  return { donation: donationWhereAll(scoped, PAID_CONTRIBUTING_FILTER) };
}

/** GET /api/admin/subscriptions/overview/stats — monthly subscriptions + donations from subscriptions */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "all";
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const categoryId = searchParams.get("categoryId");
    const campaignId = searchParams.get("campaignId");
    const referralIdParam = searchParams.get("referralId");

    let referralId: string | null = null;
    if (referralIdParam) {
      const ref = await prisma.referral.findUnique({
        where: { id: referralIdParam },
        select: { id: true },
      });
      if (!ref) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }
      referralId = ref.id;
    }

    const { startDate, endDate } = getDateRange(period, startParam, endParam);
    const subBase = buildSubscriptionWhere(categoryId, campaignId, referralId);
    // ACTIVE subscription without any settled charge isn't really earning revenue —
    // exclude it from MRR / "التبرعات الشهرية الناشطة" so a failed-only sub doesn't inflate the totals.
    const activeMonthlyWhere: Prisma.SubscriptionWhereInput = {
      ...subBase,
      status: "ACTIVE",
      donations: { some: PAID_CONTRIBUTING_FILTER },
    };
    const donationChargeBase = buildDonationChargeBase(startDate, endDate, categoryId, campaignId, referralId);

    // Revenue and paid counts window on `paidAt` and require settlement, so every money figure on
    // this page is computed the same way the chart computes it. Windowing these on `createdAt`
    // (with the lenient filter, whose `paidAt` arm is vacuous once `subscriptionId` is required)
    // counted abandoned checkouts as income and made the cards disagree with the chart.
    const donationSettledBase = buildDonationSettledBase(startDate, endDate, categoryId, campaignId, referralId);
    // donationWhereAll, not spread — the base carries a category `OR` that would
    // otherwise be overwritten by the paid filter's own `OR`.
    const donationPaidWhere = donationWhereAll(donationSettledBase, PAID_CONTRIBUTING_FILTER);

    // Failures stay windowed on `createdAt`: a failed charge never settles, so it has no
    // `paidAt` to bucket by, and windowing it on one would silently report zero failures.
    const donationFailedWhere = donationWhereAll(donationChargeBase, { status: "FAILED" as const });
    const donationAllTimeBase = buildDonationChargeAllTimeBase(categoryId, campaignId, referralId);
    // Strict here too — "all-time revenue" must mean money that actually settled, otherwise the
    // all-time card drifts from the sum of the periods that make it up.
    const donationPaidAllTime = donationWhereAll(donationAllTimeBase, PAID_CONTRIBUTING_FILTER);

    const { monthStart, monthEnd } = getCurrentCalendarMonthIstanbulRange();
    const thisMonthBase = buildDonationSettledBase(
      monthStart,
      monthEnd,
      categoryId,
      campaignId,
      referralId
    );
    // PAID_CONTRIBUTING_FILTER (status=PAID *and* paidAt set), not the lenient
    // PAID_DONATION_FILTER — the card must agree with the chart on what counts as revenue.
    const thisMonthPaid = donationWhereAll(thisMonthBase, PAID_CONTRIBUTING_FILTER);

    const [
      totalCampaigns,
      totalCategories,
      totalUsers,
      totalDonations,
      paidDonationCount,
      failedDonationCount,
      totalAmountResult,
      thisMonthTotalResult,
      allTimeRevenueResult,
      failedTotalResult,
      campaignDonationsSum,
      categoryDonationsSum,
      recentDonations,
      activeSubscriptionCount,
      pausedSubscriptionCount,
      cancelledSubscriptionCount,
      monthlyRecurringRevenueResult,
      pausedAmountResult,
      cancelledAmountResult,
      newSubscriptionsInPeriod,
      totalSubscriptionsMatching,
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.category.count(),
      prisma.user.count(),
      prisma.donation.count({ where: donationChargeBase }),
      prisma.donation.count({ where: donationPaidWhere }),
      prisma.donation.count({ where: donationFailedWhere }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: donationPaidWhere,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: thisMonthPaid,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: donationPaidAllTime,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: donationFailedWhere,
      }),
      prisma.donationItem.aggregate({
        _sum: { amountUSD: true, amount: true },
        _count: { id: true },
        where: buildDonationItemWhereSub(startDate, endDate, categoryId, campaignId, referralId),
      }),
      prisma.donationCategoryItem.aggregate({
        _sum: { amountUSD: true, amount: true },
        _count: { id: true },
        where: buildDonationCategoryItemWhereSub(startDate, endDate, categoryId, referralId),
      }),
      prisma.donation.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        where: donationChargeBase,
        select: {
          id: true,
          amount: true,
          totalAmount: true,
          amountUSD: true,
          createdAt: true,
          currency: true,
          subscriptionId: true,
          status: true,
          donor: { select: { name: true } },
          items: { select: { campaign: { select: { title: true } } } },
          categoryItems: { select: { category: { select: { name: true } } } },
        },
      }),
      prisma.subscription.count({ where: activeMonthlyWhere }),
      prisma.subscription.count({ where: { ...subBase, status: "PAUSED" } }),
      prisma.subscription.count({ where: { ...subBase, status: "CANCELLED" } }),
      prisma.subscription.aggregate({
        _sum: { amountUSD: true },
        where: activeMonthlyWhere,
      }),
      prisma.subscription.aggregate({
        _sum: { amountUSD: true },
        where: { ...subBase, status: "PAUSED" },
      }),
      prisma.subscription.aggregate({
        _sum: { amountUSD: true },
        where: { ...subBase, status: "CANCELLED" },
      }),
      prisma.subscription.count({
        where: { ...subBase, createdAt: { gte: startDate, lte: endDate } },
      }),
      prisma.subscription.count({ where: subBase }),
    ]);

    let totalAmount = totalAmountResult._sum?.amountUSD ?? 0;
    if (totalAmount === 0 && paidDonationCount > 0) {
      totalAmount = await donationUsdSumFallback(donationPaidWhere);
    }
    let thisMonthRevenue = thisMonthTotalResult._sum?.amountUSD ?? 0;
    if (thisMonthRevenue === 0) {
      const paidThisMonth = await prisma.donation.count({ where: thisMonthPaid });
      if (paidThisMonth > 0) {
        thisMonthRevenue = await donationUsdSumFallback(thisMonthPaid);
      }
    }
    let allTimeRevenue = allTimeRevenueResult._sum?.amountUSD ?? 0;
    if (allTimeRevenue === 0) {
      const allTimePaidCount = await prisma.donation.count({ where: donationPaidAllTime });
      if (allTimePaidCount > 0) {
        allTimeRevenue = await donationUsdSumFallback(donationPaidAllTime);
      }
    }
    const monthlyRecurringRevenue = monthlyRecurringRevenueResult._sum?.amountUSD ?? 0;
    const activeMonthlyAmountUSD = monthlyRecurringRevenue;
    const pausedSubscriptionAmountUSD = pausedAmountResult._sum?.amountUSD ?? 0;
    const cancelledSubscriptionAmountUSD = cancelledAmountResult._sum?.amountUSD ?? 0;
    const monthlyStoppedAmountUSD = pausedSubscriptionAmountUSD + cancelledSubscriptionAmountUSD;

    const campaignDonationsTotal =
      campaignDonationsSum._sum?.amountUSD ?? campaignDonationsSum._sum?.amount ?? 0;
    const categoryDonationsTotal =
      categoryDonationsSum._sum?.amountUSD ?? categoryDonationsSum._sum?.amount ?? 0;
    const campaignDonationsCount = campaignDonationsSum._count?.id ?? 0;
    const categoryDonationsCount = categoryDonationsSum._count?.id ?? 0;

    const donationsForSupportFees = await prisma.donation.findMany({
      where: donationPaidWhere,
      select: { amountUSD: true, amount: true, currency: true, totalAmount: true, teamSupport: true, fees: true },
      take: 100000,
    });
    const toUSD = (
      rows: {
        amountUSD: number | null;
        amount: number;
        currency: string;
        totalAmount: number;
        teamSupport?: number | null;
        fees?: number | null;
      }[]
    ) =>
      rows.reduce(
        (acc, r) => {
          const usd = donationRowUsdApprox(r);
          // See app/api/admin/stats/route.ts — `|| 1` made an unproratable row contribute
          // `usd * teamSupport` instead of its share. Skip such rows entirely.
          const total = Number(r.totalAmount) || 0;
          if (total > 0) {
            acc.teamSupport += usd * ((r.teamSupport ?? 0) / total);
            acc.fees += usd * ((r.fees ?? 0) / total);
          }
          return acc;
        },
        { teamSupport: 0, fees: 0 }
      );
    const { teamSupport: teamSupportTotal, fees: feesTotal } = toUSD(donationsForSupportFees);

    const recentDonationsList = Array.isArray(recentDonations) ? recentDonations : [];
    const recentDonationsFormatted = recentDonationsList.map((d) => ({
      id: d.id,
      amount: d.totalAmount ?? d.amount ?? 0,
      currency: d.currency ?? "USD",
      donorName: d.donor?.name ?? "—",
      type: "MONTHLY" as const,
      status: d.status,
      campaignTitle: d.items?.[0]?.campaign?.title ?? null,
      categoryName: d.categoryItems?.[0]?.category?.name ?? null,
      createdAt: d.createdAt,
    }));

    const failedTotalAmount = failedTotalResult._sum?.amountUSD ?? 0;

    /** All successful subscription charges ever — ignores category/campaign/referral filters */
    const globalSubPaidWhere = { subscriptionId: { not: null }, ...PAID_CONTRIBUTING_FILTER };
    let paidRevenueAllTimeUnfiltered =
      (await prisma.donation.aggregate({ _sum: { amountUSD: true }, where: globalSubPaidWhere }))._sum
        ?.amountUSD ?? 0;
    if (paidRevenueAllTimeUnfiltered === 0) {
      const n = await prisma.donation.count({ where: globalSubPaidWhere });
      if (n > 0) paidRevenueAllTimeUnfiltered = await donationUsdSumFallback(globalSubPaidWhere);
    }

    return NextResponse.json({
      totalCampaigns,
      totalCategories,
      totalUsers,
      totalDonations,
      paidCount: paidDonationCount,
      failedCount: failedDonationCount,
      failedTotalAmount,
      totalAmount,
      allTimeRevenue,
      paidRevenueAllTimeUnfiltered,
      thisMonthRevenue,
      monthlyRecurringRevenue,
      activeMonthlyAmountUSD,
      monthlyStoppedAmountUSD,
      pausedSubscriptionAmountUSD,
      cancelledSubscriptionAmountUSD,
      activeMonthlyCount: activeSubscriptionCount,
      pausedSubscriptionCount,
      cancelledSubscriptionCount,
      monthlyStoppedCount: pausedSubscriptionCount + cancelledSubscriptionCount,
      newSubscriptionsInPeriod,
      totalSubscriptionsMatching,
      monthlyCount: paidDonationCount,
      oneTimeCount: 0,
      oneTimeTotalAmount: 0,
      monthlyTotalAmount: totalAmount,
      campaignDonationsTotal,
      categoryDonationsTotal,
      campaignDonationsCount,
      categoryDonationsCount,
      teamSupportTotal,
      feesTotal,
      recentDonations: recentDonationsFormatted,
    });
  } catch (error) {
    console.error("Error fetching subscription stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch subscription statistics",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
