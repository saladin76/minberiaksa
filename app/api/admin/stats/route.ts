import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentCalendarMonthIstanbulRange } from '@/lib/admin/current-calendar-month-utc';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import {
  PAID_DONATION_FILTER,
  donationRowUsdApprox,
  donationUsdRevenueFallback,
  donationUsdSumFallback,
} from '@/lib/dashboard/donation-usd-revenue';
import { istanbulDateKeysToUtcRange } from '@/lib/admin/istanbul-calendar';
import { donationFieldEmpty, donationWhereAll } from '@/lib/donations/mongo-null';

function getDateRange(period: string, startParam?: string | null, endParam?: string | null) {
  let endDate: Date;
  let startDate: Date;
  if (startParam && endParam) {
    // Dashboard filter emits Istanbul YYYY-MM-DD keys — interpret 00:00 as
    // Istanbul midnight so the stats match the chart bucketing.
    ({ startDate, endDate } = istanbulDateKeysToUtcRange(startParam, endParam));
  } else if (period === 'all') {
    endDate = new Date();
    startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 10);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else {
    endDate = endParam ? new Date(endParam + 'T23:59:59.999Z') : new Date();
    startDate = new Date(endDate);
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  }
  return { startDate, endDate };
}

function buildDonationWhere(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  campaignId: string | null
) {
  const dateFilter = { createdAt: { gte: startDate, lte: endDate } };
  const base: Record<string, unknown> = { ...dateFilter };
  if (campaignId && campaignId !== 'all') {
    base.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== 'all') {
    base.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  return base;
}

/** Same filters as buildDonationWhere but no date — all-time إيرادات (donation amountUSD sum) */
function buildDonationWhereAllTime(categoryId: string | null, campaignId: string | null) {
  const base: Record<string, unknown> = {};
  if (campaignId && campaignId !== 'all') {
    base.items = { some: { campaignId } };
  } else if (categoryId && categoryId !== 'all') {
    base.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
      { categoryItems: { some: { categoryId } } },
    ];
  }
  return base;
}

function mergeLocaleFilter(where: Record<string, unknown>, locale: string | null): Record<string, unknown> {
  if (!locale || locale === 'all') return where;
  const lw =
    locale === '__unset'
      ? { OR: [{ locale: null }, { locale: '' }] }
      : { locale };
  return { AND: [where, lw] };
}

function mergeCountryFilter(where: Record<string, unknown>, country: string | null): Record<string, unknown> {
  if (!country || country === 'all') return where;
  const cw =
    country === '__unset'
      ? { OR: [{ donorCountryCode: null }, { donorCountryCode: '' }] }
      : { donorCountryCode: country.toUpperCase() };
  return { AND: [where, cw] };
}

function mergeFilters(
  where: Record<string, unknown>,
  locale: string | null,
  country: string | null
) {
  return mergeCountryFilter(mergeLocaleFilter(where, locale), country);
}

function buildDonationItemWhere(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  campaignId: string | null,
  locale: string | null,
  country: string | null
) {
  const base: Record<string, unknown> = {
    donation: mergeFilters(
      { createdAt: { gte: startDate, lte: endDate }, ...PAID_DONATION_FILTER },
      locale,
      country
    ),
  };
  if (campaignId && campaignId !== 'all') {
    base.campaignId = campaignId;
  } else if (categoryId && categoryId !== 'all') {
    base.campaign = { categoryIds: { has: categoryId } };
  }
  return base;
}

function buildDonationCategoryItemWhere(
  startDate: Date,
  endDate: Date,
  categoryId: string | null,
  locale: string | null,
  country: string | null
) {
  const base: Record<string, unknown> = {
    donation: mergeFilters(
      { createdAt: { gte: startDate, lte: endDate }, ...PAID_DONATION_FILTER },
      locale,
      country
    ),
  };
  if (categoryId && categoryId !== 'all') {
    base.categoryId = categoryId;
  }
  return base;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'revenue');
    if (denied) return denied;

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'all';
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const categoryId = searchParams.get('categoryId');
    const campaignId = searchParams.get('campaignId');
    const locale = searchParams.get('locale')?.trim() ?? null;
    const country = searchParams.get('country')?.trim() ?? null;

    const { startDate, endDate } = getDateRange(period, startParam, endParam);
    const donationWhere = mergeFilters(
      buildDonationWhere(startDate, endDate, categoryId, campaignId),
      locale,
      country
    );
    const donationWhereAllTime = mergeFilters(
      buildDonationWhereAllTime(categoryId, campaignId),
      locale,
      country
    );

    // Revenue counts settled one-time donations plus subscription rows (PAID_DONATION_FILTER is
    // deliberately lenient for subscriptions — see lib/dashboard/donation-usd-revenue.ts).
    //
    // These MUST be composed with donationWhereAll, not object spread. Both `donationWhere`
    // (category filter) and PAID_DONATION_FILTER carry a top-level `OR`, and spreading one over
    // the other silently drops the category filter — which made every revenue card show
    // org-wide totals next to a correctly-scoped donation count.
    const paidWhere = donationWhereAll(donationWhere, PAID_DONATION_FILTER);
    // `subscriptionId` is ABSENT on 1172 of 1218 one-time donations, and `{ subscriptionId: null }`
    // does not match an absent field on MongoDB — it matched 41 of 1022 paid one-time donations.
    const oneTimeWhere = donationWhereAll(paidWhere, donationFieldEmpty('subscriptionId'));
    const fromSubscriptionWhere = donationWhereAll(paidWhere, { subscriptionId: { not: null } });
    const failedWhere = donationWhereAll(donationWhere, { status: 'FAILED' as const });
    // All-status splits for the "breakdown" cards ("مرة واحدة (عدد)" / "شهرية (عدد)")
    const oneTimeAllWhere = donationWhereAll(donationWhere, donationFieldEmpty('subscriptionId'));
    const monthlyAllWhere = donationWhereAll(donationWhere, { subscriptionId: { not: null } });

    const { monthStart, monthEnd } = getCurrentCalendarMonthIstanbulRange();
    const thisMonthDonationWhere = mergeFilters(
      buildDonationWhere(monthStart, monthEnd, categoryId, campaignId),
      locale,
      country
    );
    const thisMonthPaidWhere = donationWhereAll(thisMonthDonationWhere, PAID_DONATION_FILTER);

    const subscriptionWhere: Record<string, unknown> = { status: 'ACTIVE' };
    if (campaignId && campaignId !== 'all') {
      subscriptionWhere.items = { some: { campaignId } };
    } else if (categoryId && categoryId !== 'all') {
      subscriptionWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }
    // ACTIVE subscription without any settled charge isn't really earning revenue —
    // exclude it from MRR / "التبرعات الشهرية الناشطة" so a failed-only sub doesn't inflate the totals.
    const activeMonthlyWhere = { ...subscriptionWhere, donations: { some: PAID_DONATION_FILTER } };

    const [
      totalCampaigns,
      totalCategories,
      totalUsers,
      totalDonations,
      paidCount,
      failedCount,
      totalAmountResult,
      oneTimeCount,
      fromSubscriptionCount,
      oneTimeAllCount,
      monthlyAllCount,
      activeSubscriptionCount,
      stoppedSubscriptionCount,
      monthlyRecurringRevenueResult,
      monthlyStoppedAmountResult,
      oneTimeTotalResult,
      fromSubscriptionTotalResult,
      thisMonthTotalResult,
      allTimeRevenueResult,
      failedTotalResult,
      campaignDonationsSum,
      categoryDonationsSum,
      recentDonations,
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.category.count(),
      prisma.user.count(),
      prisma.donation.count({ where: donationWhere }),
      prisma.donation.count({ where: paidWhere }),
      prisma.donation.count({ where: failedWhere }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: paidWhere,
      }),
      prisma.donation.count({ where: oneTimeWhere }),
      prisma.donation.count({ where: fromSubscriptionWhere }),
      prisma.donation.count({ where: oneTimeAllWhere }),
      prisma.donation.count({ where: monthlyAllWhere }),
      prisma.subscription.count({ where: activeMonthlyWhere }),
      prisma.subscription.count({
        where: { status: { in: ['PAUSED', 'CANCELLED'] } },
      }),
      prisma.subscription.aggregate({
        _sum: { amountUSD: true },
        where: activeMonthlyWhere,
      }),
      prisma.subscription.aggregate({
        _sum: { amountUSD: true },
        where: { status: { in: ['PAUSED', 'CANCELLED'] } },
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: oneTimeWhere,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: fromSubscriptionWhere,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: thisMonthPaidWhere,
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: donationWhereAll(donationWhereAllTime, PAID_DONATION_FILTER),
      }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: failedWhere,
      }),
      prisma.donationItem.aggregate({
        _sum: { amountUSD: true, amount: true },
        _count: { id: true },
        where: buildDonationItemWhere(startDate, endDate, categoryId, campaignId, locale, country),
      }),
      prisma.donationCategoryItem.aggregate({
        _sum: { amountUSD: true, amount: true },
        _count: { id: true },
        where: buildDonationCategoryItemWhere(startDate, endDate, categoryId, locale, country),
      }),
      prisma.donation.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: donationWhere,
        select: {
          id: true,
          amount: true,
          totalAmount: true,
          amountUSD: true,
          createdAt: true,
          currency: true,
          subscriptionId: true,
          status: true,
          provider: true,
          paymentMethod: true,
          providerErrorMessage: true,
          attribution: true,
          conversionEventsSentAt: true,
          conversionFailedEventsSentAt: true,
          donor: { select: { name: true } },
          items: {
            select: {
              campaign: { select: { title: true } },
            },
          },
          categoryItems: {
            select: {
              category: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    let oneTimeTotalAmount = oneTimeTotalResult._sum?.amountUSD ?? 0;
    let fromSubscriptionTotalAmount = fromSubscriptionTotalResult._sum?.amountUSD ?? 0;
    // Card 1 (إيرادات ناجحة للفترة) must match the way thisMonthRevenue/allTimeRevenue
    // are computed — a single sum over paidWhere. Using oneTime + monthly split
    // can undercount when subscriptionId is *unset* (not explicit null) on legacy
    // Mongo rows, because Prisma's { subscriptionId: null } and { not: null } both
    // miss those. Use the unified aggregate as the source of truth.
    const totalPaidAgg = await prisma.donation.aggregate({
      _sum: { amountUSD: true },
      where: paidWhere,
    });
    let totalAmount = totalPaidAgg._sum?.amountUSD ?? 0;
    if (totalAmount === 0 && paidCount > 0) {
      const fb = await donationUsdRevenueFallback(paidWhere);
      oneTimeTotalAmount = fb.oneTime;
      fromSubscriptionTotalAmount = fb.monthly;
      totalAmount = fb.total;
    }
    // If unified total exceeds the split (legacy unset subscriptionId rows),
    // attribute the gap to one-time so the pie still sums to totalAmount.
    const splitSum = oneTimeTotalAmount + fromSubscriptionTotalAmount;
    if (totalAmount > splitSum) {
      oneTimeTotalAmount += totalAmount - splitSum;
    }

    const monthlyRecurringRevenue = monthlyRecurringRevenueResult._sum?.amountUSD ?? 0;
    const activeMonthlyAmountUSD = monthlyRecurringRevenue;
    const monthlyStoppedAmountUSD = monthlyStoppedAmountResult._sum?.amountUSD ?? 0;
    let thisMonthRevenue = thisMonthTotalResult._sum?.amountUSD ?? 0;
    if (thisMonthRevenue === 0) {
      const paidThisMonth = await prisma.donation.count({ where: thisMonthPaidWhere });
      if (paidThisMonth > 0) {
        thisMonthRevenue = await donationUsdSumFallback(thisMonthPaidWhere);
      }
    }
    let allTimeRevenue = allTimeRevenueResult._sum?.amountUSD ?? 0;
    if (allTimeRevenue === 0) {
      const allTimePaidWhere = donationWhereAll(donationWhereAllTime, PAID_DONATION_FILTER);
      const allTimePaidCount = await prisma.donation.count({ where: allTimePaidWhere });
      if (allTimePaidCount > 0) {
        allTimeRevenue = await donationUsdSumFallback(allTimePaidWhere);
      }
    }
    const campaignDonationsTotal = campaignDonationsSum._sum?.amountUSD ?? campaignDonationsSum._sum?.amount ?? 0;
    const categoryDonationsTotal = categoryDonationsSum._sum?.amountUSD ?? categoryDonationsSum._sum?.amount ?? 0;
    const campaignDonationsCount = campaignDonationsSum._count?.id ?? 0;
    const categoryDonationsCount = categoryDonationsSum._count?.id ?? 0;

    const donationsForSupportFees = await prisma.donation.findMany({
      where: paidWhere,
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
          // `|| 1` was a divide-by-zero guard that silently changed the MEANING of the sum:
          // with totalAmount = 0 the row stopped contributing its *share* of teamSupport and
          // instead contributed `usd * teamSupport` outright, letting a single row dominate
          // the whole card. A row we cannot prorate must contribute nothing, not something
          // wrong. (Measured 2026-08-01: 0 settled rows have totalAmount <= 0 today, so this
          // guards a future row rather than correcting a current number.)
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
      amountUSD: d.amountUSD ?? 0,
      currency: d.currency,
      donorName: d.donor?.name ?? '—',
      type: d.subscriptionId ? ('MONTHLY' as const) : ('ONE_TIME' as const),
      status: d.status,
      provider: d.provider ?? null,
      paymentMethod: d.paymentMethod ?? null,
      providerErrorMessage: d.providerErrorMessage ?? null,
      attribution: d.attribution ?? null,
      conversionEventsSentAt: d.conversionEventsSentAt ?? null,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt ?? null,
      campaignTitle: d.items[0]?.campaign?.title ?? null,
      categoryName: d.categoryItems[0]?.category?.name ?? null,
      createdAt: d.createdAt,
    }));

    const failedTotalAmount = failedTotalResult._sum?.amountUSD ?? 0;

    /** All successful charges ever — ignores period / category / campaign query filters */
    const globalPaidWhere = { ...PAID_DONATION_FILTER };
    let paidRevenueAllTimeUnfiltered =
      (await prisma.donation.aggregate({ _sum: { amountUSD: true }, where: globalPaidWhere }))._sum?.amountUSD ?? 0;
    if (paidRevenueAllTimeUnfiltered === 0) {
      const globalPaidCount = await prisma.donation.count({ where: globalPaidWhere });
      if (globalPaidCount > 0) {
        paidRevenueAllTimeUnfiltered = await donationUsdSumFallback(globalPaidWhere);
      }
    }

    // Companions to `paidRevenueAllTimeUnfiltered`, for the headline band that states it is
    // NOT affected by the period/category/campaign filters. The filtered `paidCount`,
    // `activeMonthlyCount` and `monthlyRecurringRevenue` above cannot be shown next to that
    // claim — on a filtered view they would quietly contradict the figure they sit beside.
    const globalActiveSubscriptionWhere = {
      status: 'ACTIVE' as const,
      donations: { some: PAID_DONATION_FILTER },
    };
    const [paidCountAllTimeUnfiltered, activeMonthlyCountUnfiltered, mrrUnfilteredResult] =
      await Promise.all([
        prisma.donation.count({ where: globalPaidWhere }),
        prisma.subscription.count({ where: globalActiveSubscriptionWhere }),
        prisma.subscription.aggregate({
          _sum: { amountUSD: true },
          where: globalActiveSubscriptionWhere,
        }),
      ]);
    const monthlyRecurringRevenueUnfiltered = mrrUnfilteredResult._sum?.amountUSD ?? 0;

    return NextResponse.json({
      totalCampaigns,
      totalCategories,
      totalDonations,
      totalUsers,
      // Revenue (PAID only)
      totalAmount,
      allTimeRevenue,
      paidRevenueAllTimeUnfiltered,
      paidCountAllTimeUnfiltered,
      activeMonthlyCountUnfiltered,
      monthlyRecurringRevenueUnfiltered,
      paidCount,
      failedCount,
      failedTotalAmount,
      oneTimeCount,
      monthlyCount: fromSubscriptionCount,
      oneTimeAllCount,
      monthlyAllCount,
      activeMonthlyCount: activeSubscriptionCount,
      monthlyStoppedCount: stoppedSubscriptionCount,
      monthlyRecurringRevenue,
      activeMonthlyAmountUSD,
      monthlyStoppedAmountUSD,
      thisMonthRevenue,
      oneTimeTotalAmount,
      monthlyTotalAmount: fromSubscriptionTotalAmount,
      campaignDonationsTotal,
      categoryDonationsTotal,
      campaignDonationsCount,
      categoryDonationsCount,
      teamSupportTotal,
      feesTotal,
      recentDonations: recentDonationsFormatted,
      monthlyTransactionCount: fromSubscriptionCount,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch admin statistics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
