import "server-only";

import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

/**
 * The donor account's data.
 *
 * `Minbar/حساب المتبرع.dc.html` is entirely prop-driven — it renders whatever a
 * parent hands it and shows an em dash for everything else. The real account
 * reads the signed-in donor's own rows: their profile, their donations, and
 * their recurring plans.
 *
 * Only `PAID` donations are counted and listed. A pending bank transfer is not
 * a donation yet — `DONATION_LOGIC_SPEC §3` is explicit that a transfer becomes
 * real only once a finance officer matches the money received — and totalling
 * unconfirmed rows would tell a donor they gave more than they have.
 */

export interface MinbarDonorProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Stored as a plain string by the profile form, not a date column. */
  birthdate: string | null;
  /** Assembled from the country/region/city the donor set on their profile. */
  address: string | null;
  /** ISO timestamp the account was created. */
  memberSince: string;
}

export interface MinbarDonationRow {
  id: string;
  /** ISO timestamp — paid date where known, else when the row was created. */
  date: string;
  /** Total charged, in the currency the donor actually paid in. */
  amount: number;
  currency: string;
  /** The campaigns this donation was split across, already translated. */
  titles: string[];
  /** `true` when the donation was charged against a recurring plan. */
  recurring: boolean;
}

export interface MinbarAccountSummary {
  profile: MinbarDonorProfile;
  donations: MinbarDonationRow[];
  /** Lifetime total in USD, across confirmed donations only. */
  totalDonatedUSD: number;
  donationCount: number;
  activeSubscriptions: number;
}

/** How many donations the history list shows. */
const HISTORY_LIMIT = 20;

/**
 * Everything the account page renders, for one donor.
 *
 * Returns `null` when the user no longer exists — a stale session should send
 * the visitor to sign in again rather than render an account shell with an em
 * dash in every field.
 */
export async function getAccountSummary(
  userId: string,
  locale: string
): Promise<MinbarAccountSummary | null> {
  try {
    const [user, rows, aggregate, activeSubscriptions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          birthdate: true,
          city: true,
          region: true,
          countryName: true,
          country: true,
          createdAt: true,
        },
      }),
      prisma.donation.findMany({
        where: { donorId: userId, status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        select: {
          id: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          paidAt: true,
          subscriptionId: true,
          items: {
            select: {
              campaign: {
                select: {
                  title: true,
                  translations: {
                    where: translationLocaleWhere(locale),
                    take: 2,
                    select: { locale: true, title: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.donation.aggregate({
        where: { donorId: userId, status: "PAID" },
        _sum: { amountUSD: true },
        _count: { _all: true },
      }),
      prisma.subscription.count({ where: { donorId: userId, status: "ACTIVE" } }),
    ]);

    if (!user) return null;

    /* City, region and country as the donor filled them in — whichever parts
       exist, in that order. An empty profile yields `null`, not a stray comma. */
    const address =
      [user.city, user.region, user.countryName || user.country].filter(Boolean).join("، ") || null;

    const donations: MinbarDonationRow[] = rows.map((row) => ({
      id: row.id,
      date: (row.paidAt ?? row.createdAt).toISOString(),
      amount: row.totalAmount,
      currency: row.currency,
      titles: row.items
        .map((item) => {
          const t = pickTranslation(item.campaign.translations, locale);
          return t?.title || item.campaign.title;
        })
        .filter(Boolean),
      recurring: Boolean(row.subscriptionId),
    }));

    return {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthdate: user.birthdate,
        address,
        memberSince: user.createdAt.toISOString(),
      },
      donations,
      totalDonatedUSD: aggregate._sum.amountUSD ?? 0,
      donationCount: aggregate._count._all,
      activeSubscriptions,
    };
  } catch (err) {
    console.error("getAccountSummary failed:", err);
    return null;
  }
}
