import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SubscriptionExportRow } from "./donation-export";
import { loadSubscriptionFrequencies, monthlyEquivalent } from "./recurring-frequency-filter";

/** Current snapshot of plans referenced by the exported donations, never a site-wide count. */
export async function loadReportSubscriptions(ids: string[], client: PrismaClient = prisma): Promise<SubscriptionExportRow[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const [plans, charges, frequencyOf] = await Promise.all([
    client.subscription.findMany({
      where: { id: { in: unique } },
      select: {
        id: true, status: true, amount: true, amountUSD: true, currency: true, teamSupport: true,
        paymentMethod: true, provider: true, createdAt: true, lastBillingDate: true, nextBillingDate: true,
        donor: { select: { id: true, name: true, email: true, phone: true, countryCode: true } },
        items: { select: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { select: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true, name: true } },
      }, orderBy: { createdAt: "desc" },
    }),
    client.donation.groupBy({ by: ["subscriptionId", "currency"], where: { subscriptionId: { in: unique }, status: "PAID", paidAt: { not: null } },
      _count: { _all: true, amountUSD: true }, _sum: { amount: true, amountUSD: true } }),
    loadSubscriptionFrequencies(client, unique),
  ]);
  const totals = new Map<string, typeof charges>();
  for (const charge of charges) if (charge.subscriptionId) {
    const list = totals.get(charge.subscriptionId) ?? []; list.push(charge); totals.set(charge.subscriptionId, list);
  }
  return plans.map(s => {
    const frequency = frequencyOf(s.id);
    const history = totals.get(s.id) ?? [];
    const totalCount = history.reduce((sum, c) => sum + c._count._all, 0);
    return {
      id: s.id, status: s.status, frequency, provider: s.provider,
      amount: s.amount, amountUSD: s.amountUSD, currency: s.currency, teamSupport: s.teamSupport,
      monthlyEquivalentUSD: s.amountUSD == null ? null : monthlyEquivalent(s.amountUSD, frequency),
      donor: { id: s.donor?.id ?? null, name: s.donor?.name ?? null, email: s.donor?.email ?? null,
        phone: s.donor?.phone ?? null, countryCode: s.donor?.countryCode ?? null },
      paymentMethod: s.paymentMethod, createdAt: s.createdAt, lastBillingDate: s.lastBillingDate,
      nextBillingDate: s.nextBillingDate, campaigns: s.items.map(i => i.campaign),
      categories: s.categoryItems.map(i => i.category), referral: s.referral,
      totalChargesCount: totalCount,
      totalChargesAmount: history.some(c => c.currency !== s.currency) ? null : history.reduce((sum, c) => sum + (c._sum.amount ?? 0), 0), totalChargesAmountUSD: history.reduce((sum, c) => sum + (c._sum.amountUSD ?? 0), 0),
      totalChargesMissingUSD: (totalCount) - history.reduce((sum, c) => sum + c._count.amountUSD, 0),
    };
  });
}
