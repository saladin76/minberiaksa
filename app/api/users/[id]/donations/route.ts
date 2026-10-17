import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/options';
import { userCanViewUserProfilesInDashboard } from '@/lib/dashboard/permissions';
import { donationRowUsdApprox } from '@/lib/dashboard/donation-usd-revenue';
import { loadSubscriptionFrequencies } from '@/lib/dashboard/recurring-frequency-filter';

/**
 * GET /api/users/[id]/donations
 *
 * Every donation row of one donor  successful, unconfirmed and failed  for the
 * table in the dashboard user-profile dialog. Each row carries its outcome so the
 * table can tell them apart; `totals` covers successful rows only (PAID + paidAt,
 * the same rule as PAID_DONATION_FILTER), so it matches the dialog's «الإجمالي».
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const canViewOthers =
      session.user.role === 'ADMIN' || userCanViewUserProfilesInDashboard(session.user);
    if (!canViewOthers && session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const donations = await prisma.donation.findMany({
      where: { donorId: id },
      select: {
        id: true,
        amount: true,
        amountUSD: true,
        totalAmount: true,
        currency: true,
        status: true,
        paidAt: true,
        createdAt: true,
        paymentMethod: true,
        subscriptionId: true,
        items: { select: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { select: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const frequencyOf = await loadSubscriptionFrequencies(
      prisma,
      donations.map((d) => d.subscriptionId).filter((sid): sid is string => Boolean(sid))
    );

    const rows = donations.map((d) => {
      const outcome =
        d.status === 'FAILED' ? 'FAILED' : d.paidAt != null ? 'SUCCESS' : 'PENDING';
      return {
        id: d.id,
        outcome,
        subscriptionId: d.subscriptionId,
        frequency: d.subscriptionId ? frequencyOf(d.subscriptionId) : null,
        amount: d.totalAmount ?? d.amount,
        amountUSD: donationRowUsdApprox(d),
        currency: d.currency,
        paymentMethod: d.paymentMethod ?? null,
        createdAt: d.createdAt,
        paidAt: d.paidAt,
        campaigns: d.items.map((i) => i.campaign),
        categories: d.categoryItems.map((i) => i.category),
        referral: d.referral,
      };
    });

    const successful = rows.filter((r) => r.outcome === 'SUCCESS');
    return NextResponse.json({
      rows,
      totals: {
        count: rows.length,
        successCount: successful.length,
        successAmountUSD: Number(successful.reduce((t, r) => t + r.amountUSD, 0).toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error fetching user donations:', error);
    return NextResponse.json({ error: 'Failed to fetch donations' }, { status: 500 });
  }
}
