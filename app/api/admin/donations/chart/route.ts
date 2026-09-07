import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import { donationRowUsdApprox } from '@/lib/dashboard/donation-usd-revenue';
import {
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  getIstanbulDateRange,
} from '@/lib/admin/istanbul-calendar';

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
    const showFailed = searchParams.get('showFailed') === 'true';
    const locale = searchParams.get('locale')?.trim() ?? null;
    const country = searchParams.get('country')?.trim() ?? null;

    const { startDate, endDate, startDateKey, endDateKey } = getIstanbulDateRange(period, startParam, endParam);

    // Bucket PAID donations by `paidAt` (the moment money actually landed) and
    // FAILED donations by `createdAt` (they never have a paidAt). This way a
    // donation paid at 00:30 Istanbul May 20 lands in May 20's bar even if its
    // checkout row was inserted at 23:55 May 19. Window is the Istanbul day
    // boundary expressed in UTC.
    // Unsettled subscription rows (status=PAID, no `paidAt`) are NOT counted. They used to
    // be admitted here and bucketed by `createdAt`, which is why this chart reported $17.19
    // on 2026-08-02 while /dashboard/monthly reported $1.05 for the same day — the extra
    // $16.14 was an abandoned checkout that never reached Stripe. Both pages now recognise
    // revenue on settlement only, so their monthly series agree.
    const dateWindowOr = [
      { status: 'PAID', paidAt: { gte: startDate, lte: endDate } },
      { status: 'FAILED', createdAt: { gte: startDate, lte: endDate } },
    ];

    const innerWhere: Record<string, unknown> = {
      OR: dateWindowOr,
    };

    if (userId && userId !== 'all') {
      innerWhere.donorId = userId;
    }

    if (campaignId && campaignId !== 'all') {
      innerWhere.AND = [{ items: { some: { campaignId } } }];
    } else if (categoryId && categoryId !== 'all') {
      innerWhere.AND = [
        {
          OR: [
            { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
            { categoryItems: { some: { categoryId } } },
          ],
        },
      ];
    }

    const baseWhere = mergeCountryFilter(mergeLocaleFilter(innerWhere, locale), country);

    // Always fetch both paid and failed donations
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
        // Required by donationRowUsdApprox — without it a USD row with a null amountUSD
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
      teamSupport: number;
      fees: number;
    };
    const byDate = new Map<string, Bucket>();

    for (const d of donations) {
      // status=PAID is set at creation, before the gateway confirms, so settlement
      // (`paidAt`) is what makes a row revenue — for subscription rows too. Subscription
      // rows used to be exempt from this; see the dateWindowOr comment above for why
      // that exemption was wrong and what it cost.
      const isPaid = d.status === 'PAID' && d.paidAt != null;
      const isFailed = d.status === 'FAILED';
      if (!isPaid && !isFailed) continue;

      const bucketDate = isPaid ? ((d.paidAt as Date | null) ?? d.createdAt) : d.createdAt;
      const dateStr = formatIstanbulDateKey(bucketDate);
      const bucket = byDate.get(dateStr) ?? {
        amountOneTime: 0,
        countOneTime: 0,
        amountMonthly: 0,
        countMonthly: 0,
        amountFailed: 0,
        countFailed: 0,
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
      teamSupport: number;
      fees: number;
    }[] = [];

    for (const dateStr of eachIstanbulDateKey(startDateKey, endDateKey)) {
      const b = byDate.get(dateStr);
      const amountOneTime = b ? Number(Number(b.amountOneTime).toFixed(2)) : 0;
      const amountMonthly = b ? Number(Number(b.amountMonthly).toFixed(2)) : 0;
      const amountFailed = b ? Number(Number(b.amountFailed).toFixed(2)) : 0;
      const countOneTime = b?.countOneTime ?? 0;
      const countMonthly = b?.countMonthly ?? 0;
      const countFailed = b?.countFailed ?? 0;
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
