import "server-only";

import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/slug";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

/**
 * The single donation behind the success page.
 *
 * `Minbar/نجاح التبرع.dc.html` reads its waqf details out of `localStorage`
 * because it has no server. Here the donation itself is the source: what was
 * given, to what, for how much, and under which receipt number. The basket in
 * the browser is display state and is never trusted for any of it.
 */

export interface MinbarDonationSummary {
  id: string;
  /** Receipt number shown to the donor — the donation id, as the PDF uses. */
  receiptNo: string;
  /** Total charged, in the currency it was charged in. */
  amount: number;
  currency: string;
  /** ISO timestamp — paid where known, else created. */
  date: string;
  /** Campaign titles this donation was split across, already translated. */
  titles: string[];
  /** The donor's name as recorded, for pre-filling the certificate. */
  donorName: string | null;
  /** `true` when the donation was charged against a recurring plan. */
  recurring: boolean;
  /** Confirmed. A pending transfer is not shown as a completed donation. */
  paid: boolean;
}

/**
 * One donation by id.
 *
 * Returns `null` for an unknown id, a malformed id, or a donation that is not
 * `PAID` — the success page must never congratulate a donor on a payment that
 * has not settled. A pending bank transfer has its own screen.
 */
export async function getDonationSummary(
  id: string,
  locale: string
): Promise<MinbarDonationSummary | null> {
  /* `id` is a Mongo ObjectId column: handing it an arbitrary string makes
     Prisma throw rather than miss, which would be a 500 instead of a 404. */
  if (!isObjectId(id)) return null;

  try {
    const row = await prisma.donation.findFirst({
      where: { id, status: "PAID" },
      select: {
        id: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        subscriptionId: true,
        donor: { select: { name: true } },
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
    });

    if (!row) return null;

    return {
      id: row.id,
      receiptNo: row.id,
      amount: row.totalAmount,
      currency: row.currency,
      date: (row.paidAt ?? row.createdAt).toISOString(),
      titles: row.items
        .map((item) => {
          const t = pickTranslation(item.campaign.translations, locale);
          return t?.title || item.campaign.title;
        })
        .filter(Boolean),
      donorName: row.donor?.name ?? null,
      recurring: Boolean(row.subscriptionId),
      paid: true,
    };
  } catch (err) {
    console.error("getDonationSummary failed:", err);
    return null;
  }
}
