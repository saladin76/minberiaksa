import "server-only";

import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

/**
 * What the concierge knows about a signed-in donor: their own giving, in the
 * shape the account page shows it. Loaded from the session's user id only —
 * never from anything the browser sends — and reduced to what a donor could
 * already read on their account page. No email, phone, address, card or
 * gateway identifiers leave this module; the model sees first name, dates,
 * amounts, statuses and campaign titles.
 */

export type DonationState = "paid" | "pending_confirmation" | "awaiting_receipt" | "under_review" | "rejected" | "failed";

export interface DonorDonation {
  id: string;
  date: string;
  amount: number;
  currency: string;
  amountUSD: number | null;
  state: DonationState;
  method: string | null;
  /** Campaign / category titles on the order, localized. */
  items: string[];
  recurring: boolean;
  /** Receipt and thank-you certificate exist once the payment is confirmed. */
  documentsReady: boolean;
}

export interface DonorPlan {
  id: string;
  frequency: "DAILY" | "FRIDAY" | "MONTHLY";
  amount: number;
  currency: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED";
  nextBillingDate: string | null;
  lastBillingDate: string | null;
  items: string[];
}

export interface DonorContext {
  userId: string;
  firstName: string;
  memberSince: string;
  totals: { donations: number; paidUSD: number };
  recent: DonorDonation[];
  plans: DonorPlan[];
  /** Ids of donations the model may point the donor to (receipt, certificate, pending page). */
  donationIds: string[];
}

const RECENT = 8;

function stateOf(d: { status: string; paidAt: Date | null; paymentMethod: string | null; bankTransferClaim: { status: string } | null }): DonationState {
  if (d.status === "PAID" && d.paidAt) return "paid";
  if (d.paymentMethod === "BANK_TRANSFER" || d.bankTransferClaim) {
    const s = d.bankTransferClaim?.status;
    if (s === "REJECTED") return "rejected";
    if (s === "UNDER_REVIEW") return "under_review";
    if (s === "CONFIRMED") return "paid";
    return "awaiting_receipt";
  }
  if (d.status === "FAILED") return "failed";
  return "pending_confirmation";
}

export async function loadDonorContext(userId: string, locale: string): Promise<DonorContext | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, createdAt: true } });
  if (!user) return null;

  const itemSelect = {
    items: { select: { campaign: { select: { title: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, title: true } } } } } },
    categoryItems: { select: { category: { select: { name: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true } } } } } },
  } as const;

  const [donations, paidAgg, count, plans] = await Promise.all([
    prisma.donation.findMany({
      where: { donorId: userId },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: {
        id: true,
        createdAt: true,
        paidAt: true,
        status: true,
        totalAmount: true,
        currency: true,
        amountUSD: true,
        paymentMethod: true,
        subscriptionId: true,
        bankTransferClaim: { select: { status: true } },
        waqfItems: { select: { unit: true, count: true } },
        ...itemSelect,
      },
    }),
    prisma.donation.aggregate({ where: { donorId: userId, status: "PAID", paidAt: { not: null } }, _sum: { amountUSD: true } }),
    prisma.donation.count({ where: { donorId: userId, status: "PAID", paidAt: { not: null } } }),
    prisma.subscription.findMany({
      where: { donorId: userId, status: { in: ["ACTIVE", "PAUSED", "PAYMENT_FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, frequency: true, amount: true, currency: true, status: true, nextBillingDate: true, lastBillingDate: true, ...itemSelect },
    }),
  ]);

  const titles = (row: { items: Array<{ campaign: { title: string; translations: Array<{ locale: string; title: string }> } }>; categoryItems: Array<{ category: { name: string; translations: Array<{ locale: string; name: string }> } }> }): string[] => [
    ...row.items.map((i) => pickTranslation(i.campaign.translations, locale)?.title || i.campaign.title),
    ...row.categoryItems.map((i) => pickTranslation(i.category.translations, locale)?.name || i.category.name),
  ];

  const recent: DonorDonation[] = donations.map((d) => {
    const state = stateOf(d);
    const waqf = d.waqfItems.map((w) => `${w.unit === "METER" ? "waqf metre" : "waqf share"} × ${w.count}`);
    return {
      id: d.id,
      date: d.createdAt.toISOString().slice(0, 10),
      amount: d.totalAmount,
      currency: d.currency,
      amountUSD: d.amountUSD,
      state,
      method: d.paymentMethod,
      items: [...titles(d), ...waqf],
      recurring: Boolean(d.subscriptionId),
      documentsReady: state === "paid",
    };
  });

  return {
    userId: user.id,
    firstName: (user.name ?? "").trim().split(/\s+/)[0] || "",
    memberSince: user.createdAt.toISOString().slice(0, 10),
    totals: { donations: count, paidUSD: Math.round((paidAgg._sum.amountUSD ?? 0) * 100) / 100 },
    recent,
    plans: plans.map((p) => ({
      id: p.id,
      frequency: p.frequency as DonorPlan["frequency"],
      amount: p.amount,
      currency: p.currency,
      status: p.status as DonorPlan["status"],
      nextBillingDate: p.nextBillingDate ? p.nextBillingDate.toISOString().slice(0, 10) : null,
      lastBillingDate: p.lastBillingDate ? p.lastBillingDate.toISOString().slice(0, 10) : null,
      items: titles(p),
    })),
    donationIds: donations.map((d) => d.id),
  };
}
