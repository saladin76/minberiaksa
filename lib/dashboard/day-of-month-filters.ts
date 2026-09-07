import { Prisma } from "@prisma/client";
import { PAID_CONTRIBUTING_FILTER } from "@/lib/dashboard/donation-usd-revenue";
import { formatIstanbulDateKey } from "@/lib/admin/istanbul-calendar";

/**
 * Shared filter/bucketing rules for the «الوارد حسب يوم الشهر» grid and its
 * per-day drill-down.
 *
 * These live in one place on purpose. The grid shows a number per day and the
 * drill-down lists the rows behind that number — if the two built their `where`
 * clauses separately, any future edit to one would silently make the list stop
 * matching the figure the user clicked, which is the exact class of bug that
 * makes a dashboard untrustworthy. One definition, two callers.
 */

export interface DayOfMonthFilterInput {
  categoryId?: string | null;
  campaignId?: string | null;
  userId?: string | null;
  referralId?: string | null;
}

const isSet = (v: string | null | undefined): v is string => Boolean(v && v !== "all");

export function buildDayOfMonthFilters(input: DayOfMonthFilterInput): {
  donationWhere: Prisma.DonationWhereInput;
  subscriptionWhere: Prisma.SubscriptionWhereInput;
} {
  const { categoryId, campaignId, userId, referralId } = input;
  const byCampaign = isSet(campaignId);
  const byCategory = !byCampaign && isSet(categoryId);

  // ---- collected: settled subscription donations, all time ----
  const donationWhere: Prisma.DonationWhereInput = {
    subscriptionId: { not: null },
    status: "PAID",
    // Not null implicitly — a null paidAt cannot satisfy a range, and settlement is what
    // makes a row real money. Same rule the chart and the KPI cards use.
    paidAt: { not: null },
  };
  if (isSet(referralId)) donationWhere.referralId = referralId;
  if (isSet(userId)) donationWhere.donorId = userId;
  if (byCampaign) {
    donationWhere.items = { some: { campaignId: campaignId as string } };
  } else if (byCategory) {
    donationWhere.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId as string } } } } },
      { categoryItems: { some: { categoryId: categoryId as string } } },
    ];
  }

  // ---- expected: active subscriptions and the day they bill on ----
  // `status: ACTIVE` alone is not enough. A subscription whose only charge attempts FAILED
  // (declined card) stays ACTIVE but has never produced money — 18 of them, worth $217/mo.
  // The MRR card already requires at least one settled charge; match it, or this view and
  // that card disagree by exactly those phantom subscriptions.
  const subscriptionWhere: Prisma.SubscriptionWhereInput = {
    status: "ACTIVE",
    donations: { some: PAID_CONTRIBUTING_FILTER },
  };
  if (isSet(referralId)) subscriptionWhere.referralId = referralId;
  if (isSet(userId)) subscriptionWhere.donorId = userId;
  if (byCampaign) {
    subscriptionWhere.items = { some: { campaignId: campaignId as string } };
  } else if (byCategory) {
    subscriptionWhere.OR = [
      { items: { some: { campaign: { categoryIds: { has: categoryId as string } } } } },
      { categoryItems: { some: { categoryId: categoryId as string } } },
    ];
  }

  return { donationWhere, subscriptionWhere };
}

/** Day-of-month (1..31) in the Istanbul calendar, or null if unusable. */
function dayFrom(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const day = Number(formatIstanbulDateKey(value as Date).slice(8, 10));
  return day >= 1 && day <= 31 ? day : null;
}

/**
 * The day a subscription bills on. `nextBillingDate` is authoritative; the others
 * are only fallbacks for rows that predate it being populated.
 */
export function subscriptionBillingDay(s: {
  nextBillingDate?: Date | string | null;
  lastBillingDate?: Date | string | null;
  createdAt?: Date | string | null;
}): number | null {
  return dayFrom(s.nextBillingDate ?? s.lastBillingDate ?? s.createdAt);
}

/** The day a donation actually settled on. */
export function donationSettlementDay(d: { paidAt?: Date | string | null }): number | null {
  return dayFrom(d.paidAt);
}
