import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";
import {
  matchingBadgeUserIds,
  normalizeBadgeCriteria,
  type BadgeDonationRow,
  type BadgeSubscriptionRow,
} from "@/lib/badge-criteria-core";

export { normalizeBadgeCriteria, type BadgeCriteria, type BadgeCriteriaType } from "@/lib/badge-criteria-core";

const BADGE_SCAN_BATCH_SIZE = 2500;

/** Resolve donors against settled donations only. Empty candidate lists never widen the query. */
export async function getUserIdsMatchingBadge(criteriaInput: unknown, candidateUserIds?: string[]): Promise<string[]> {
  const criteria = normalizeBadgeCriteria(criteriaInput);
  if (!criteria) return [];
  if (candidateUserIds !== undefined && candidateUserIds.length === 0) return [];

  const candidateWhere: Prisma.DonationWhereInput = candidateUserIds === undefined
    ? {}
    : { donorId: { in: candidateUserIds } };

  if (criteria.type === "MONTHLY_ACTIVE_RANGE") {
    const subscriptionWhere: Prisma.SubscriptionWhereInput = {
      status: "ACTIVE",
      frequency: "MONTHLY",
      ...(candidateUserIds === undefined ? {} : { donorId: { in: candidateUserIds } }),
    };
    const subscriptions = await prisma.subscription.findMany({
      where: subscriptionWhere,
      select: { donorId: true, amountUSD: true, amount: true, currency: true, status: true, frequency: true },
    });
    return matchingBadgeUserIds(criteria, [], subscriptions as BadgeSubscriptionRow[]);
  }

  const donationBaseWhere: Prisma.DonationWhereInput = {
    AND: [candidateWhere, PAID_DONATION_FILTER],
  };

  if (criteria.type === "ANY_SPAN_N_MONTHS") {
    const rows: BadgeDonationRow[] = [];
    let cursorId: string | undefined;
    while (true) {
      const batch = await prisma.donation.findMany({
        where: cursorId
          ? { AND: [donationBaseWhere, { id: { gt: cursorId } }] }
          : donationBaseWhere,
        orderBy: { id: "asc" },
        take: BADGE_SCAN_BATCH_SIZE,
        select: { id: true, donorId: true, amountUSD: true, amount: true, currency: true, status: true, paidAt: true },
      });
      rows.push(...batch as BadgeDonationRow[]);
      if (batch.length < BADGE_SCAN_BATCH_SIZE) break;
      cursorId = batch[batch.length - 1]!.id;
    }
    return matchingBadgeUserIds(criteria, rows);
  }

  const now = new Date();
  const timeFilter: Prisma.DonationWhereInput = criteria.type === "TOTAL_LAST_N_MONTHS"
    ? { paidAt: { gte: monthsAgo(now, criteria.months ?? 1), lte: now } }
    : {};
  const grouped = await prisma.donation.groupBy({
    by: ["donorId"],
    where: { AND: [candidateWhere, PAID_DONATION_FILTER, timeFilter] },
    _sum: { amountUSD: true },
    _count: { id: true },
  });

  if (criteria.type === "DONATION_COUNT_MIN") {
    return grouped.filter((row) => row._count.id >= (criteria.count ?? Infinity)).map((row) => row.donorId);
  }

  const sums = new Map(grouped.map((row) => [row.donorId, row._sum.amountUSD ?? 0]));
  const usdFallbackRows = await prisma.donation.findMany({
    where: {
      AND: [
        candidateWhere,
        PAID_DONATION_FILTER,
        timeFilter,
        {
          currency: "USD",
          OR: [{ amountUSD: null }, { amountUSD: { isSet: false } }, { amountUSD: 0 }],
        },
      ],
    },
    select: { donorId: true, amountUSD: true, amount: true, currency: true },
  });
  for (const row of usdFallbackRows) {
    sums.set(row.donorId, (sums.get(row.donorId) ?? 0) + donationRowUsdApprox(row));
  }

  return [...sums.entries()]
    .filter(([, amount]) => amount >= (criteria.amountMinUSD ?? Infinity))
    .map(([userId]) => userId);
}

/** Compute badge memberships for a bounded visible donor page. */
export async function getBadgeIdsByUser(
  userIds: string[],
  badges: { id: string; criteria: unknown }[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const id of userIds) result.set(id, []);
  if (!userIds.length || !badges.length) return result;

  for (const badge of badges) {
    const matching = await getUserIdsMatchingBadge(badge.criteria, userIds);
    for (const userId of matching) {
      result.get(userId)?.push(badge.id);
    }
  }
  return result;
}

function monthsAgo(now: Date, months: number): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = (month % 12 + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(now.getUTCDate(), lastDay),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  ));
}
