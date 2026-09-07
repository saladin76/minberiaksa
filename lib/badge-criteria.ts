import { prisma } from "@/lib/prisma";

export type BadgeCriteriaType =
  | "TOTAL_LAST_N_MONTHS"
  | "ANY_SPAN_N_MONTHS"
  | "MONTHLY_ACTIVE_RANGE"
  | "TOTAL_LIFETIME"
  | "DONATION_COUNT_MIN";

export interface BadgeCriteria {
  type: BadgeCriteriaType;
  amountMinUSD?: number;
  amountMaxUSD?: number;
  months?: number;
  count?: number;
}

/**
 * Returns user IDs that match the badge criteria.
 */
export async function getUserIdsMatchingBadge(criteria: unknown): Promise<string[]> {
  const c = criteria as BadgeCriteria | null;
  if (!c?.type) return [];

  switch (c.type) {
    case "TOTAL_LAST_N_MONTHS": {
      const months = Math.max(1, c.months ?? 1);
      const amountMin = c.amountMinUSD ?? 0;
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const groups = await prisma.donation.groupBy({
        by: ["donorId"],
        where: { createdAt: { gte: since } },
        _sum: { amountUSD: true },
      });
      const effectiveMin = amountMin > 0 ? amountMin : 0.01;
      return groups
        .filter((g) => (g._sum.amountUSD ?? 0) >= effectiveMin)
        .map((g) => g.donorId as string);
    }

    case "ANY_SPAN_N_MONTHS": {
      const months = Math.max(1, c.months ?? 1);
      const amountMin = c.amountMinUSD ?? 0;
      const effectiveMin = amountMin > 0 ? amountMin : 0.01;
      const allDonations = await prisma.donation.findMany({
        select: { donorId: true, amountUSD: true, createdAt: true },
      });
      const byUser = new Map<string, { amountUSD: number; createdAt: Date }[]>();
      for (const d of allDonations) {
        const id = d.donorId as string;
        if (!byUser.has(id)) byUser.set(id, []);
        byUser.get(id)!.push({
          amountUSD: d.amountUSD ?? 0,
          createdAt: d.createdAt,
        });
      }
      const matching: string[] = [];
      for (const [userId, donations] of byUser) {
        const byMonth = new Map<string, number>();
        for (const d of donations) {
          const k = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth()).padStart(2, "0")}`;
          byMonth.set(k, (byMonth.get(k) ?? 0) + d.amountUSD);
        }
        const keys = [...byMonth.keys()].sort();
        if (keys.length === 0) continue;
        const [y0, m0] = keys[0]!.split("-").map(Number);
        const [yLast, mLast] = keys[keys.length - 1]!.split("-").map(Number);
        let found = false;
        for (let y = y0; y <= yLast && !found; y++) {
          const startM = y === y0 ? m0 : 0;
          const endM = y === yLast ? mLast : 11;
          for (let m = startM; m <= endM && !found; m++) {
            let sum = 0;
            for (let i = 0; i < months; i++) {
              let my = m + i;
              let yy = y;
              if (my > 11) {
                my -= 12;
                yy += 1;
              }
              const k = `${yy}-${String(my).padStart(2, "0")}`;
              sum += byMonth.get(k) ?? 0;
            }
            if (sum >= effectiveMin) {
              found = true;
              matching.push(userId);
            }
          }
        }
      }
      return matching;
    }

    case "MONTHLY_ACTIVE_RANGE": {
      const min = c.amountMinUSD ?? 0;
      const max = c.amountMaxUSD ?? Number.MAX_SAFE_INTEGER;
      const subs = await prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        select: { donorId: true, amountUSD: true },
      });
      const byDonor = new Map<string, number>();
      for (const s of subs) {
        const sum = (byDonor.get(s.donorId) ?? 0) + (s.amountUSD ?? 0);
        byDonor.set(s.donorId, sum);
      }
      const effectiveMin = min > 0 ? min : 0.01;
      return [...byDonor.entries()]
        .filter(([, amount]) => amount >= effectiveMin && amount <= max)
        .map(([donorId]) => donorId);
    }

    case "TOTAL_LIFETIME": {
      const amountMin = c.amountMinUSD ?? 0;
      const effectiveMin = amountMin > 0 ? amountMin : 0.01;
      const groups = await prisma.donation.groupBy({
        by: ["donorId"],
        _sum: { amountUSD: true },
      });
      return groups
        .filter((g) => (g._sum.amountUSD ?? 0) >= effectiveMin)
        .map((g) => g.donorId as string);
    }

    case "DONATION_COUNT_MIN": {
      const countMin = c.count ?? 0;
      if (countMin <= 0) return [];
      const groups = await prisma.donation.groupBy({
        by: ["donorId"],
        _count: { id: true },
      });
      return groups
        .filter((g) => g._count.id >= countMin)
        .map((g) => g.donorId as string);
    }

    default:
      return [];
  }
}

/**
 * For each user in userIds, compute which badge IDs they match. Returns Map<userId, badgeIds[]>.
 */
export async function getBadgeIdsByUser(
  userIds: string[],
  badges: { id: string; criteria: unknown }[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const id of userIds) result.set(id, []);

  for (const badge of badges) {
    const matching = await getUserIdsMatchingBadge(badge.criteria);
    for (const uid of matching) {
      if (result.has(uid)) result.get(uid)!.push(badge.id);
    }
  }
  return result;
}
