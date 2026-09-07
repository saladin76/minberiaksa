import { prisma } from "@/lib/prisma";
import { getIstanbulDateRange } from "@/lib/admin/istanbul-calendar";
import type { AggregateDonationInput } from "@/lib/attribution/aggregate";

export interface AdsDonationsQuery {
  period: string;
  startParam: string | null;
  endParam: string | null;
  categoryId: string | null;
  campaignId: string | null;
  /** Donor country filter — applied at fetch time. */
  country: string | null;
}

/**
 * Fetch donation rows for the ads-intelligence routes and enrich each with
 * `isFirstEverDonation` (true when this is the donor's earliest *paid*
 * donation across all time, not just in-window). Two queries: the window
 * fetch and a per-donor `findFirst` aggregated via `groupBy` for the
 * first-paid-at lookup.
 */
export async function fetchAdsDonations(
  q: AdsDonationsQuery
): Promise<{
  donations: AggregateDonationInput[];
  range: { startDate: Date; endDate: Date; startDateKey: string; endDateKey: string };
}> {
  const range = getIstanbulDateRange(q.period, q.startParam, q.endParam);

  // Match the chart endpoint's semantics: PAID by paidAt, FAILED by createdAt.
  const where: Record<string, unknown> = {
    OR: [
      { status: "PAID", paidAt: { gte: range.startDate, lte: range.endDate } },
      { status: "FAILED", createdAt: { gte: range.startDate, lte: range.endDate } },
    ],
  };

  if (q.campaignId && q.campaignId !== "all") {
    where.AND = [{ items: { some: { campaignId: q.campaignId } } }];
  } else if (q.categoryId && q.categoryId !== "all") {
    where.AND = [
      {
        OR: [
          { items: { some: { campaign: { categoryId: q.categoryId } } } },
          { categoryItems: { some: { categoryId: q.categoryId } } },
        ],
      },
    ];
  }
  if (q.country && q.country !== "all") {
    const countryWhere =
      q.country === "__unset"
        ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
        : { donorCountryCode: q.country.toUpperCase() };
    const prevAnd = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [...prevAnd, countryWhere];
  }

  const rows = await prisma.donation.findMany({
    where,
    select: {
      id: true,
      status: true,
      paidAt: true,
      amountUSD: true,
      totalAmount: true,
      amount: true,
      currency: true,
      attribution: true,
      conversionEventsSentAt: true,
      conversionFailedEventsSentAt: true,
      donorId: true,
      donorCountryCode: true,
      createdAt: true,
    },
  });

  // First-ever paid donation per donor — anchors new-donor attribution.
  const donorIds = Array.from(new Set(rows.map((r) => r.donorId)));
  const firstByDonor: Record<string, Date> = {};
  if (donorIds.length > 0) {
    const firsts = await prisma.donation.groupBy({
      by: ["donorId"],
      where: { donorId: { in: donorIds }, status: "PAID", paidAt: { not: null } },
      _min: { paidAt: true },
    });
    for (const f of firsts) {
      if (f._min.paidAt) firstByDonor[f.donorId] = f._min.paidAt;
    }
  }

  const donations: AggregateDonationInput[] = rows.map((d) => {
    const firstPaid = firstByDonor[d.donorId];
    const isFirstEverDonation =
      d.status === "PAID" &&
      d.paidAt != null &&
      firstPaid != null &&
      Math.abs(d.paidAt.getTime() - firstPaid.getTime()) < 1000;
    return {
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
      paidAt: d.paidAt,
      amountUSD: d.amountUSD,
      totalAmount: d.totalAmount,
      amount: d.amount,
      currency: d.currency,
      attribution: (d.attribution as Record<string, unknown> | null | undefined) ?? null,
      conversionEventsSentAt: d.conversionEventsSentAt,
      conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
      donorId: d.donorId,
      donorCountryCode: d.donorCountryCode,
      isFirstEverDonation,
    };
  });

  return { donations, range };
}
