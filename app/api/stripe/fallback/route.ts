import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

// POST /api/stripe/fallback
// Called when PayFor 3D fails. Creates a new PaymentIntent for the donation and
// returns clientSecret so the client can confirm with raw card data via stripe.js.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // See app/api/stripe/checkout/route.ts — an unauthenticated request previously died with a
    // TypeError 500 on `session.user.id` rather than a clean 401.
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { donationId?: string; locale?: string };
    const donationId = String(body.donationId || "").trim();

    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        items: { include: { campaign: { select: { title: true } } } },
        categoryItems: { include: { category: { select: { name: true } } } },
      },
    });

    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }
    if (donation.donorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (donation.status === "PAID") {
      return NextResponse.json({ error: "Donation already paid" }, { status: 400 });
    }

    const locale = (body.locale ?? donation.locale ?? "en").toLowerCase();
    const currency = (donation.currency || "USD").toLowerCase();
    const amountInSmallestUnit = Math.round(donation.totalAmount * 100);

    const campaignNames = donation.items.map((i) => i.campaign.title).join(", ");
    const categoryNames = donation.categoryItems.map((i) => i.category.name).join(", ");
    const description = campaignNames || categoryNames || "Donation";

    // Clone the failed donation as a new record for retry
    let targetDonationId = donationId;

    if (donation.status === "FAILED") {
      const donorCountrySnapshot =
        donation.donorCountryCode ??
        (await getDonorCountryCodeForSnapshot(prisma, donation.donorId)) ??
        undefined;
      const newDonation = await prisma.donation.create({
        data: {
          amount: donation.amount,
          amountUSD: donation.amountUSD ?? donation.amount,
          teamSupport: donation.teamSupport,
          coverFees: donation.coverFees,
          currency: donation.currency,
          fees: donation.fees,
          totalAmount: donation.totalAmount,
          status: "PAID",
          locale: donation.locale ?? locale,
          donorCountryCode: donorCountrySnapshot,
          donorId: donation.donorId,
          paymentMethod: "CARD",
          provider: "STRIPE",
          ...(donation.referralId ? { referralId: donation.referralId } : {}),
          items:
            donation.items.length > 0
              ? {
                  create: donation.items.map((i) => ({
                    campaignId: i.campaignId,
                    amount: i.amount,
                    amountUSD: i.amountUSD,
                  })),
                }
              : undefined,
          categoryItems:
            donation.categoryItems.length > 0
              ? {
                  create: donation.categoryItems.map((i) => ({
                    categoryId: i.categoryId,
                    amount: i.amount,
                    amountUSD: i.amountUSD,
                  })),
                }
              : undefined,
        },
      });
      targetDonationId = newDonation.id;
    } else {
      // switch provider to STRIPE
      await prisma.donation.update({
        where: { id: donationId },
        data: { provider: "STRIPE" },
      });
    }

    // Create PaymentIntent without confirming — client confirms with raw card data via stripe.js
    const intent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency,
      description,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        donationId: targetDonationId,
        userId: session.user.id,
        payforFallback: "true",
        originalDonationId: donationId,
      },
    });

    await prisma.donation.update({
      where: { id: targetDonationId },
      data: { providerOrderId: intent.id },
    });

    return NextResponse.json({ clientSecret: intent.client_secret, donationId: targetDonationId });
  } catch (error) {
    console.error("[Stripe Fallback] error:", error);
    return NextResponse.json({ error: "Failed to process payment" }, { status: 500 });
  }
}
