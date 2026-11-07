import { ACTIVATING_DONATION_WHERE, subscriptionLifecycle } from "@/lib/donations/subscription-lifecycle";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/options';
import { userCanViewUserProfilesInDashboard } from '@/lib/dashboard/permissions';
import { donationRowUsdApprox } from '@/lib/dashboard/donation-usd-revenue';
import { loadSubscriptionFrequencies } from '@/lib/dashboard/recurring-frequency-filter';
import { loadDonationFinancialSummaries } from '@/lib/dashboard/donation-financial-summary';

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

    const [donations, plans] = await Promise.all([prisma.donation.findMany({
      where: { donorId: id },
      select: {
        id: true,
        provider: true,
        providerErrorMessage: true,
        billingReason: true,
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
    }),
    prisma.subscription.findMany({
      where: { donorId: id }, orderBy: { createdAt: "desc" },
      select: { id: true, status: true, amount: true, amountUSD: true, currency: true, provider: true,
        createdAt: true, lastBillingDate: true, nextBillingDate: true, chargeAttempts: true, lastChargeError: true,
        donations: { where: ACTIVATING_DONATION_WHERE, select: { id: true }, take: 1 },
        items: { select: { campaign: { select: { title: true } } } },
        categoryItems: { select: { category: { select: { name: true } } } } },
    })]);

    const [frequencyOf, financial] = await Promise.all([
      loadSubscriptionFrequencies(prisma, [...plans.map(plan => plan.id), ...donations.map(donation => donation.subscriptionId).filter((id): id is string => Boolean(id))]),
      loadDonationFinancialSummaries(prisma, donations.filter(row => ["ALBARAKA", "PAYFOR"].includes(row.provider || "")).map(row => row.id)),
    ]);
    const subscriptions = plans.map(plan => {
      const latest = donations.find(donation => donation.subscriptionId === plan.id && donation.billingReason !== "subscription_test_cycle");
      const failure = plan.lastChargeError || (latest?.status === "FAILED" ? latest.providerErrorMessage : null);
      return {
      id: plan.id, status: plan.status, lifecycle: subscriptionLifecycle({ ...plan, hasPaidDonation: plan.donations.length > 0 }),
      activated: plan.donations.length > 0, frequency: frequencyOf(plan.id),
      amount: plan.amount, currency: plan.currency, provider: plan.provider || "STRIPE",
      lastBillingDate: plan.lastBillingDate, nextBillingDate: plan.nextBillingDate,
      chargeAttempts: plan.chargeAttempts, lastChargeError: failure,
      projects: [...plan.items.map(item => item.campaign.title), ...plan.categoryItems.map(item => item.category.name)],
      };
    });

    const rows = donations.map((d) => {
      const outcome =
        d.status === 'FAILED' ? 'FAILED' : d.paidAt != null ? 'SUCCESS' : 'PENDING';
      return {
        id: d.id,
        outcome,
        financialSummary: financial.get(d.id) ?? null,
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
      subscriptions,
      totals: {
        count: rows.length,
        successCount: successful.length,
        successAmountUSD: Number(successful.reduce((t, r) => t + r.amountUSD, 0).toFixed(2)),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error('Error fetching user donations:', error);
    return NextResponse.json({ error: 'Failed to fetch donations' }, { status: 500 });
  }
}
