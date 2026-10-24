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

export interface BadgeDonationRow {
  donorId: string;
  amountUSD: number | null;
  amount: number;
  currency: string;
  status: string;
  paidAt: Date | null;
}

export interface BadgeSubscriptionRow {
  donorId: string;
  amountUSD: number | null;
  amount: number;
  currency: string;
  status: string;
  frequency: string | null;
}

const TYPES = new Set<BadgeCriteriaType>([
  "TOTAL_LAST_N_MONTHS",
  "ANY_SPAN_N_MONTHS",
  "MONTHLY_ACTIVE_RANGE",
  "TOTAL_LIFETIME",
  "DONATION_COUNT_MIN",
]);
const MAX_USD = 1_000_000_000;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPositiveUsd(value: unknown): value is number {
  return finiteNumber(value) && value > 0 && value <= MAX_USD;
}

/** Validate and strip criteria fields that do not apply to the selected type. */
export function normalizeBadgeCriteria(value: unknown): BadgeCriteria | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.type !== "string" || !TYPES.has(source.type as BadgeCriteriaType)) return null;
  const type = source.type as BadgeCriteriaType;

  switch (type) {
    case "TOTAL_LIFETIME":
      return validPositiveUsd(source.amountMinUSD) ? { type, amountMinUSD: source.amountMinUSD } : null;
    case "TOTAL_LAST_N_MONTHS":
    case "ANY_SPAN_N_MONTHS":
      return validPositiveUsd(source.amountMinUSD) && Number.isInteger(source.months) && Number(source.months) >= 1 && Number(source.months) <= 120
        ? { type, amountMinUSD: source.amountMinUSD, months: Number(source.months) }
        : null;
    case "MONTHLY_ACTIVE_RANGE":
      return finiteNumber(source.amountMinUSD) && source.amountMinUSD >= 0 && source.amountMinUSD <= MAX_USD &&
        finiteNumber(source.amountMaxUSD) && source.amountMaxUSD >= source.amountMinUSD && source.amountMaxUSD <= MAX_USD
        ? { type, amountMinUSD: source.amountMinUSD, amountMaxUSD: source.amountMaxUSD }
        : null;
    case "DONATION_COUNT_MIN":
      return Number.isInteger(source.count) && Number(source.count) >= 1 && Number(source.count) <= 1_000_000
        ? { type, count: Number(source.count) }
        : null;
  }
}

function paidUsd(row: Pick<BadgeDonationRow | BadgeSubscriptionRow, "amountUSD" | "amount" | "currency">): number {
  if (finiteNumber(row.amountUSD) && row.amountUSD > 0) return row.amountUSD;
  return row.currency === "USD" && finiteNumber(row.amount) && row.amount > 0 ? row.amount : 0;
}

function isSettledDonation(row: BadgeDonationRow): boolean {
  return row.status === "PAID" && row.paidAt instanceof Date && Number.isFinite(row.paidAt.getTime());
}

function subtractCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = (month % 12 + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    day,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function monthOrdinal(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Pure business-rule evaluation shared by audience filters and tests. */
export function matchingBadgeUserIds(
  criteria: BadgeCriteria,
  donations: BadgeDonationRow[],
  subscriptions: BadgeSubscriptionRow[] = [],
  now = new Date(),
): string[] {
  const settled = donations.filter(isSettledDonation);
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();

  if (criteria.type === "MONTHLY_ACTIVE_RANGE") {
    const monthlyTotals = new Map<string, number>();
    for (const subscription of subscriptions) {
      if (subscription.status !== "ACTIVE" || subscription.frequency !== "MONTHLY") continue;
      monthlyTotals.set(subscription.donorId, (monthlyTotals.get(subscription.donorId) ?? 0) + paidUsd(subscription));
    }
    return [...monthlyTotals.entries()]
      .filter(([, amount]) => amount >= (criteria.amountMinUSD ?? 0) && amount <= (criteria.amountMaxUSD ?? 0))
      .map(([userId]) => userId);
  }

  for (const donation of settled) {
    const amount = paidUsd(donation);
    totals.set(donation.donorId, (totals.get(donation.donorId) ?? 0) + amount);
    counts.set(donation.donorId, (counts.get(donation.donorId) ?? 0) + 1);
  }

  switch (criteria.type) {
    case "TOTAL_LIFETIME":
      return [...totals.entries()].filter(([, amount]) => amount >= (criteria.amountMinUSD ?? Infinity)).map(([id]) => id);
    case "TOTAL_LAST_N_MONTHS": {
      const since = subtractCalendarMonths(now, criteria.months ?? 1);
      const recentTotals = new Map<string, number>();
      for (const donation of settled) {
        if (donation.paidAt! < since || donation.paidAt! > now) continue;
        recentTotals.set(donation.donorId, (recentTotals.get(donation.donorId) ?? 0) + paidUsd(donation));
      }
      return [...recentTotals.entries()].filter(([, amount]) => amount >= (criteria.amountMinUSD ?? Infinity)).map(([id]) => id);
    }
    case "DONATION_COUNT_MIN":
      return [...counts.entries()].filter(([, count]) => count >= (criteria.count ?? Infinity)).map(([id]) => id);
    case "ANY_SPAN_N_MONTHS": {
      const monthTotals = new Map<string, Map<number, number>>();
      for (const donation of settled) {
        const ordinal = monthOrdinal(donation.paidAt!);
        const months = monthTotals.get(donation.donorId) ?? new Map<number, number>();
        months.set(ordinal, (months.get(ordinal) ?? 0) + paidUsd(donation));
        monthTotals.set(donation.donorId, months);
      }
      const windowMonths = criteria.months ?? 1;
      const threshold = criteria.amountMinUSD ?? Infinity;
      const matched: string[] = [];
      for (const [userId, months] of monthTotals) {
        const ordinals = [...months.keys()].sort((a, b) => a - b);
        if (!ordinals.length) continue;
        for (let start = ordinals[0]!; start <= ordinals[ordinals.length - 1]!; start++) {
          let sum = 0;
          for (let offset = 0; offset < windowMonths; offset++) sum += months.get(start + offset) ?? 0;
          if (sum >= threshold) {
            matched.push(userId);
            break;
          }
        }
      }
      return matched;
    }
  }
}
