import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { isValidLocale } from "@/lib/locales";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { resolveReferralId } from "@/lib/referral-server";
import {
  convertAmountInCurrencyToUsd,
  normalizeDonationCurrencyCode,
} from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/**
 * POST /api/stripe/intent
 *
 * Creates a donation record (PAID) and a Stripe PaymentIntent (one-time)
 * or a Customer + Subscription (monthly), then returns the clientSecret so
 * the browser can confirm via Stripe Elements — no redirect needed.
 *
 * Body: same shape as POST /api/donations
 * Response: { clientSecret, donationId }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    

    const body = await req.json();
    const {
      items,
      categoryItems,
      currency,
      teamSupport = 0,
      coverFees = false,
      type = "ONE_TIME",
      referralCode,
      referralId: bodyReferralId,
      locale: donationLocale,
    } = body;

    const hasCampaignItems = Array.isArray(items) && items.length > 0;
    const hasCategoryItems = Array.isArray(categoryItems) && categoryItems.length > 0;

    if (!hasCampaignItems && !hasCategoryItems) {
      return NextResponse.json({ error: "items or categoryItems required" }, { status: 400 });
    }
    if (!currency) {
      return NextResponse.json({ error: "currency required" }, { status: 400 });
    }

    // Totals
    const campaignTotal = hasCampaignItems
      ? (items as { amount: number }[]).reduce((s, i) => s + i.amount, 0)
      : 0;
    const categoryTotal = hasCategoryItems
      ? (categoryItems as { amount: number }[]).reduce((s, i) => s + i.amount, 0)
      : 0;
    const totalAmount = campaignTotal + categoryTotal;

    const fees = (totalAmount + teamSupport) * 0.03;
    const finalTotal = totalAmount + teamSupport + (coverFees ? fees : 0);
    const stripeCurrency = String(currency).toLowerCase();
    const stripeAmount = Math.round(finalTotal * 100);

    // Referral
    let referralId: string | null = null;
    if (bodyReferralId) {
      const ref = await prisma.referral.findUnique({
        where: { id: String(bodyReferralId).trim() },
        select: { id: true },
      });
      referralId = ref?.id ?? null;
    }
    if (!referralId) referralId = await resolveReferralId(referralCode);

    const validLocale =
      donationLocale &&
      isValidLocale(String(donationLocale).toLowerCase())
        ? String(donationLocale).toLowerCase()
        : null;

    // Verify campaigns / categories exist
    if (hasCampaignItems) {
      const ids = (items as { campaignId: string }[]).map((i) => i.campaignId);
      const found = await prisma.campaign.findMany({ where: { id: { in: ids } } });
      if (found.length !== ids.length)
        return NextResponse.json({ error: "One or more campaigns not found" }, { status: 404 });
      if (found.some((c) => !c.isActive))
        return NextResponse.json({ error: "One or more campaigns are not active" }, { status: 400 });
    }
    if (hasCategoryItems) {
      const ids = (categoryItems as { categoryId: string }[]).map((i) => i.categoryId);
      const found = await prisma.category.findMany({ where: { id: { in: ids } } });
      if (found.length !== ids.length)
        return NextResponse.json({ error: "One or more categories not found" }, { status: 404 });
    }

    const currencyNorm = normalizeDonationCurrencyCode(currency);
    let donationTotalUsd: number;
    try {
      donationTotalUsd = await convertAmountInCurrencyToUsd(finalTotal, currencyNorm);
    } catch (e) {
      console.error("[Stripe Intent] convertAmountInCurrencyToUsd (total):", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    type CampIn = {
      campaignId: string;
      amount: number;
      amountUSD?: number;
      shareCount?: number;
    };
    type CatIn = { categoryId: string; amount: number; amountUSD?: number };

    let campaignItemsResolved: Array<{
      campaignId: string;
      amount: number;
      amountUSD: number;
      shareCount?: number;
    }> = [];
    let categoryItemsResolved: Array<{ categoryId: string; amount: number; amountUSD: number }> = [];

    try {
      if (hasCampaignItems) {
        campaignItemsResolved = await Promise.all(
          (items as CampIn[]).map(async (item) => ({
            campaignId: item.campaignId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
            ...(item.shareCount != null && item.shareCount > 0
              ? { shareCount: Math.floor(item.shareCount) }
              : {}),
          }))
        );
      }
      if (hasCategoryItems) {
        categoryItemsResolved = await Promise.all(
          (categoryItems as CatIn[]).map(async (item) => ({
            categoryId: item.categoryId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
          }))
        );
      }
    } catch (e) {
      console.error("[Stripe Intent] convertAmountInCurrencyToUsd (lines):", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const donorCountrySnapshot =
      (await getDonorCountryCodeForSnapshot(prisma, session.user.id)) ?? undefined;

    // ────────────────────────────────────────────────────────
    // MONTHLY — create subscription-linked donation + Stripe Subscription
    // ────────────────────────────────────────────────────────
    if (type === "MONTHLY") {
      const { donation, subscriptionDbId } = await prisma.$transaction(
        async (tx) => {
          const nextBilling = new Date();
          nextBilling.setUTCMonth(nextBilling.getUTCMonth() + 1);
          nextBilling.setUTCHours(0, 0, 0, 0);

          const sub = await tx.subscription.create({
            data: {
              status: "ACTIVE",
              amount: totalAmount,
              amountUSD: donationTotalUsd,
              currency,
              teamSupport,
              coverFees,
              paymentMethod: "CARD",
              donorId: session.user.id,
              referralId: referralId ?? undefined,
              nextBillingDate: nextBilling,
              lastBillingDate: new Date(),
              items: hasCampaignItems
                ? {
                    create: campaignItemsResolved.map((i) => ({
                      campaignId: i.campaignId,
                      amount: i.amount,
                      amountUSD: i.amountUSD,
                      ...(i.shareCount != null && i.shareCount > 0 ? { shareCount: i.shareCount } : {}),
                    })),
                  }
                : undefined,
              categoryItems: hasCategoryItems
                ? {
                    create: categoryItemsResolved.map((i) => ({
                      categoryId: i.categoryId,
                      amount: i.amount,
                      amountUSD: i.amountUSD,
                    })),
                  }
                : undefined,
            },
          });

          const d = await tx.donation.create({
            data: {
              amount: totalAmount,
              amountUSD: donationTotalUsd,
              teamSupport,
              coverFees,
              currency,
              fees: coverFees ? fees : 0,
              totalAmount: finalTotal,
              status: "PAID",
              locale: validLocale ?? undefined,
              donorCountryCode: donorCountrySnapshot,
              donorId: session.user.id,
              referralId: referralId ?? undefined,
              subscriptionId: sub.id,
              paymentMethod: "CARD",
              provider: "STRIPE",
              items: hasCampaignItems
                ? {
                    create: campaignItemsResolved.map((i) => ({
                      campaignId: i.campaignId,
                      amount: i.amount,
                      amountUSD: i.amountUSD,
                      ...(i.shareCount != null && i.shareCount > 0 ? { shareCount: i.shareCount } : {}),
                    })),
                  }
                : undefined,
              categoryItems: hasCategoryItems
                ? {
                    create: categoryItemsResolved.map((i) => ({
                      categoryId: i.categoryId,
                      amount: i.amount,
                      amountUSD: i.amountUSD,
                    })),
                  }
                : undefined,
            },
          });

          return { donation: d, subscriptionDbId: sub.id };
        },
        { timeout: 15000 }
      );

      // Get/create Stripe customer
      let customerId: string;
      const stripeCustomerId = (
        (await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { stripeCustomerId: true } as never,
        })) as { stripeCustomerId?: string | null }
      )?.stripeCustomerId;

      if (stripeCustomerId) {
        customerId = stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: session.user.email ?? undefined,
          metadata: { userId: session.user.id },
        });
        customerId = customer.id;
        try {
          await prisma.user.update({
            where: { id: session.user.id },
            data: { stripeCustomerId: customerId } as never,
          });
        } catch {
          // Column may not exist in schema yet
        }
      }

      const productName =
        hasCampaignItems
          ? (await prisma.campaign.findMany({
              where: { id: { in: (items as { campaignId: string }[]).map((i) => i.campaignId) } },
              select: { title: true },
            }))
              .map((c) => c.title)
              .join(", ")
          : hasCategoryItems
          ? (await prisma.category.findMany({
              where: { id: { in: (categoryItems as { categoryId: string }[]).map((i) => i.categoryId) } },
              select: { name: true },
            }))
              .map((c) => c.name)
              .join(", ")
          : "Monthly Donation";

      const stripeSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            price_data: {
              currency: stripeCurrency,
              product_data: { name: productName },
              unit_amount: stripeAmount,
              recurring: { interval: "month" },
            } as any,
          },
        ],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          donationId: donation.id,
          userId: session.user.id,
          subscriptionDbId,
        },
      });

      await prisma.donation.update({
        where: { id: donation.id },
        data: { providerOrderId: stripeSub.id },
      });

      const invoice = stripeSub.latest_invoice as Stripe.Invoice & {
        payment_intent: Stripe.PaymentIntent | null;
      };
      const clientSecret = invoice?.payment_intent?.client_secret;

      if (!clientSecret) {
        return NextResponse.json({ error: "Could not get payment intent" }, { status: 500 });
      }

      return NextResponse.json({ clientSecret, donationId: donation.id });
    }

    // ────────────────────────────────────────────────────────
    // ONE-TIME — create donation + Stripe PaymentIntent
    // ────────────────────────────────────────────────────────
    const donation = await prisma.$transaction(
      async (tx) => {
        const d = await tx.donation.create({
          data: {
            amount: totalAmount,
            amountUSD: donationTotalUsd,
            teamSupport,
            coverFees,
            currency,
            fees: coverFees ? fees : 0,
            totalAmount: finalTotal,
            status: "PAID",
            locale: validLocale ?? undefined,
            donorCountryCode: donorCountrySnapshot,
            donorId: session.user.id,
            referralId: referralId ?? undefined,
            paymentMethod: "CARD",
            provider: "STRIPE",
            items: hasCampaignItems
              ? {
                  create: campaignItemsResolved.map((i) => ({
                    campaignId: i.campaignId,
                    amount: i.amount,
                    amountUSD: i.amountUSD,
                    ...(i.shareCount != null && i.shareCount > 0 ? { shareCount: i.shareCount } : {}),
                  })),
                }
              : undefined,
            categoryItems: hasCategoryItems
              ? {
                  create: categoryItemsResolved.map((i) => ({
                    categoryId: i.categoryId,
                    amount: i.amount,
                    amountUSD: i.amountUSD,
                  })),
                }
              : undefined,
          },
        });

        if (validLocale) {
          const donor = await tx.user.findUnique({
            where: { id: session.user.id },
            select: { preferredLang: true },
          });
          if (donor?.preferredLang == null) {
            await tx.user.update({
              where: { id: session.user.id },
              data: { preferredLang: validLocale },
            });
          }
        }

        return d;
      },
      { timeout: 15000 }
    );

    const productName =
      hasCampaignItems
        ? (await prisma.campaign.findMany({
            where: { id: { in: (items as { campaignId: string }[]).map((i) => i.campaignId) } },
            select: { title: true },
          }))
            .map((c) => c.title)
            .join(", ")
        : hasCategoryItems
        ? (await prisma.category.findMany({
            where: { id: { in: (categoryItems as { categoryId: string }[]).map((i) => i.categoryId) } },
            select: { name: true },
          }))
            .map((c) => c.name)
            .join(", ")
        : "Donation";

    const intent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: stripeCurrency,
      description: productName,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { donationId: donation.id, userId: session.user.id },
    });

    await prisma.donation.update({
      where: { id: donation.id },
      data: { providerOrderId: intent.id },
    });

    return NextResponse.json({ clientSecret: intent.client_secret, donationId: donation.id });
  } catch (error) {
    console.error("[Stripe Intent]", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
