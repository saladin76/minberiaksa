import "server-only";

import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/slug";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { messagesFor } from "@/i18n/locale-messages";

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
  /**
   * Every line the donation was split across — campaigns and categories —
   * each with what it received, in the charged currency. This is what the
   * receipt itemises, and the success page has to say the same thing.
   */
  lines: Array<{ title: string; amount: number; image: string | null; shares: number | null }>;
  /** The gift itself, before the optional team support and the fees. */
  donationAmount: number;
  teamSupport: number;
  fees: number;
  paymentMethod: "CARD" | "PAYPAL" | "BANK_TRANSFER" | null;
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
      /* A card order is shown here the moment the gateway returns, before the
         webhook stamps `paidAt`; a bank transfer has no gateway and is only a
         donation once a finance officer stamps it. Until then its own status
         page is the right screen, not this one. */
      where: {
        id,
        status: "PAID",
        /* Prisma+MongoDB: `null` matches only explicit nulls; a row written
           without the field needs the `isSet` arm too. */
        NOT: { AND: [{ provider: "BANK_TRANSFER" }, { OR: [{ paidAt: null }, { paidAt: { isSet: false } }] }] },
      },
      select: {
        id: true,
        amount: true,
        totalAmount: true,
        teamSupport: true,
        fees: true,
        currency: true,
        paymentMethod: true,
        createdAt: true,
        paidAt: true,
        subscriptionId: true,
        donor: { select: { name: true } },
        items: {
          select: {
            amount: true,
            shareCount: true,
            campaign: {
              select: {
                title: true,
                images: true,
                translations: {
                  where: translationLocaleWhere(locale),
                  take: 2,
                  select: { locale: true, title: true },
                },
              },
            },
          },
        },
        categoryItems: {
          select: {
            amount: true,
            category: {
              select: {
                name: true,
                image: true,
                translations: {
                  where: translationLocaleWhere(locale),
                  take: 2,
                  select: { locale: true, name: true },
                },
              },
            },
          },
        },
        waqfItems: { select: { unit: true, count: true, amount: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!row) return null;

    /* Waqf lines name their unit in the reader's language; the count is the
       number of shares or metres, shown the way a share purchase is. */
    const waqfNs = (messagesFor(locale).waqf ?? {}) as Record<string, unknown>;
    const waqfLines = row.waqfItems.map((item) => ({
      title: String(waqfNs[item.unit === "METER" ? "unitMeter" : "unitShare"] ?? ""),
      amount: item.amount,
      image: null,
      shares: item.count,
    }));

    const campaignLines = row.items.map((item) => {
      const t = pickTranslation(item.campaign.translations, locale);
      return {
        title: t?.title || item.campaign.title,
        amount: item.amount,
        image: item.campaign.images?.[0] ?? null,
        shares: item.shareCount ?? null,
      };
    });
    const categoryLines = row.categoryItems.map((item) => {
      const t = pickTranslation(item.category.translations, locale);
      return { title: t?.name || item.category.name, amount: item.amount, image: item.category.image ?? null, shares: null };
    });
    const lines = [...campaignLines, ...categoryLines, ...waqfLines].filter((line) => line.title);

    return {
      id: row.id,
      receiptNo: row.id,
      amount: row.totalAmount,
      currency: row.currency,
      date: (row.paidAt ?? row.createdAt).toISOString(),
      titles: lines.map((line) => line.title),
      lines,
      donationAmount: row.amount,
      teamSupport: row.teamSupport,
      fees: row.fees,
      paymentMethod: row.paymentMethod ?? null,
      donorName: row.donor?.name ?? null,
      recurring: Boolean(row.subscriptionId),
      paid: true,
    };
  } catch (err) {
    console.error("getDonationSummary failed:", err);
    return null;
  }
}
