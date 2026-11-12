import { NextRequest, NextResponse } from 'next/server';
import { mergeDonationProviderFilter } from '@/lib/dashboard/donation-provider-filter';
import { dashboardLocaleWhere, dashboardCountryWhere } from '@/lib/dashboard/donation-location-scope';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import { donationRowUsdApprox } from '@/lib/dashboard/donation-usd-revenue';
import { donationWhereForIds } from '@/lib/dashboard/donation-search';
import { donationChartStatusWhere, donationChartTypeWhere } from '@/lib/dashboard/donation-chart-filter-scope';
import { resolveDonationRelationFilterIds } from '@/lib/dashboard/donation-relation-filters';
import {
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  getIstanbulDateRange,
  resolveChartStartKey,
} from '@/lib/admin/istanbul-calendar';

function mergeLocaleFilter(where: Record<string, unknown>, locale: string | null): Record<string, unknown> {
  const filter = dashboardLocaleWhere(locale);
  return filter ? { AND: [where, filter] } : where;
}

function mergeCountryFilter(where: Record<string, unknown>, country: string | null): Record<string, unknown> {
  const filter = dashboardCountryWhere(country);
  return filter ? { AND: [where, filter] } : where;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'revenue');
    if (denied) return denied;

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get('categoryId');
    const campaignId = searchParams.get('campaignId');
    const userId = searchParams.get('userId');
    const period = searchParams.get('period') || 'month';
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const locale = searchParams.get('locale')?.trim() ?? null;
    const country = searchParams.get('country')?.trim() ?? null;

    const { startDate, endDate, startDateKey, endDateKey, isAllTime } = getIstanbulDateRange(period, startParam, endParam);

    // The status and donation type selectors are effective for the graph AND
    // its period summary. PAID counts only settlement, FAILED/PENDING count
    // attempts without ever adding them to confirmed income.
    const innerWhere: Record<string, unknown> = donationChartStatusWhere(
      searchParams.get('status') || 'RESOLVED', startDate, endDate,
    );
    const typeWhere = donationChartTypeWhere(searchParams.get('donationType'));
    if (userId && userId !== 'all') {
      innerWhere.donorId = userId;
    }

    const relationIds = await resolveDonationRelationFilterIds({ campaignId, categoryId });
    const relationFilters: Record<string, unknown>[] = [];
    if (campaignId && campaignId !== 'all') {
      relationFilters.push(
        donationWhereForIds(relationIds.campaignDonationIds ?? [])
      );
    }
    if (categoryId && categoryId !== 'all') {
      relationFilters.push(
        donationWhereForIds(relationIds.categoryDonationIds ?? [])
      );
    }

    const allScopeFilters = [innerWhere, ...relationFilters, ...(typeWhere ? [typeWhere] : [])];
    const queryWhere = allScopeFilters.length > 1 ? { AND: allScopeFilters } : innerWhere;
    const baseWhere = mergeDonationProviderFilter(mergeCountryFilter(mergeLocaleFilter(queryWhere, locale), country), searchParams.get('provider'));

    // Query only the requested status/type, without mistaking pending for revenue.
    const donations = await prisma.donation.findMany({
      where: baseWhere,
      select: {
        createdAt: true,
        subscriptionId: true,
        teamSupport: true,
        fees: true,
        amountUSD: true,
        totalAmount: true,
        amount: true,
        // Required by donationRowUsdApprox  without it a USD row with a null amountUSD
        // can't be recognised and would silently contribute 0.
        currency: true,
        status: true,
        paidAt: true,
        items: { select: { amount: true, amountUSD: true } },
        categoryItems: { select: { amount: true, amountUSD: true } },
      },
    });

    type Bucket = {
      amountOneTime: number;
      countOneTime: number;
      amountMonthly: number;
      countMonthly: number;
      amountFailed: number;
      countFailed: number;
      countPending: number;
      teamSupport: number;
      fees: number;
    };
    const byDate = new Map<string, Bucket>();

    for (const d of donations) {
      // status=PAID is set at creation, before the gateway confirms, so settlement
      // (`paidAt`) is what makes a row revenue  for subscription rows too. Subscription
      // rows used to be exempt from this; see the dateWindowOr comment above for why
      // that exemption was wrong and what it cost.
      const isPaid = d.status === 'PAID' && d.paidAt != null;
      const isFailed = d.status === 'FAILED' && d.paidAt == null;
      const isPending = d.status === 'PAID' && d.paidAt == null;
      if (!isPaid && !isFailed && !isPending) continue;

      const bucketDate = isPaid ? ((d.paidAt as Date | null) ?? d.createdAt) : d.createdAt;
      const dateStr = formatIstanbulDateKey(bucketDate);
      const bucket = byDate.get(dateStr) ?? {
        amountOneTime: 0,
        countOneTime: 0,
        amountMonthly: 0,
        countMonthly: 0,
        amountFailed: 0,
        countFailed: 0,
        countPending: 0,
        teamSupport: 0,
        fees: 0,
      };

      // Every series on this chart is labelled USD, so it must be summed in USD.
      // The old expression fell back to `totalAmount`/`amount` in the row's LOCAL currency,
      // so a ₺1,000 donation with no `amountUSD` plotted as 1000 on a dollar axis.
      // `donationRowUsdApprox` is the same helper the KPI cards use, so chart and card agree.
      const amount = donationRowUsdApprox(d);

      if (isPaid) {
        if (d.subscriptionId == null) {
          bucket.amountOneTime += amount;
          bucket.countOneTime += 1;
        } else {
          bucket.amountMonthly += amount;
          bucket.countMonthly += 1;
        }
        // teamSupport/fees are stored in the local currency too. Prorate them against the
        // row's USD value exactly as /api/admin/stats does, instead of adding raw lira to a
        // dollar total.
        const localTotal = Number(d.totalAmount) || 0;
        if (localTotal > 0) {
          bucket.teamSupport += amount * ((Number(d.teamSupport) || 0) / localTotal);
          bucket.fees += amount * ((Number(d.fees) || 0) / localTotal);
        }
      } else if (isFailed) {
        bucket.amountFailed += amount;
        bucket.countFailed += 1;
      } else if (isPending) {
        bucket.countPending += 1;
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
      amountFailed: number;
      countFailed: number;
      countPending: number;
      teamSupport: number;
      fees: number;
    }[] = [];

    /* All-time queries from the epoch, so the axis starts at the first day with data rather than
       at 1970  see `resolveChartStartKey`. Bounded periods are unchanged. */
    const axisStartKey = resolveChartStartKey(isAllTime, startDateKey, endDateKey, byDate.keys());

    for (const dateStr of eachIstanbulDateKey(axisStartKey, endDateKey)) {
      const b = byDate.get(dateStr);
      const amountOneTime = b ? Number(Number(b.amountOneTime).toFixed(2)) : 0;
      const amountMonthly = b ? Number(Number(b.amountMonthly).toFixed(2)) : 0;
      const amountFailed = b ? Number(Number(b.amountFailed).toFixed(2)) : 0;
      const countOneTime = b?.countOneTime ?? 0;
      const countMonthly = b?.countMonthly ?? 0;
      const countFailed = b?.countFailed ?? 0;
      const countPending = b?.countPending ?? 0;
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
        amountFailed,
        countFailed,
        countPending,
        teamSupport,
        fees,
      });
    }

    return NextResponse.json(filledChartData);
  } catch (error) {
    console.error('Error fetching donation chart data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch donation chart data', details: (error as Error).message },
      { status: 500 }
    );
  }
}
