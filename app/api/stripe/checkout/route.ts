import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

type CheckoutBody = {
  donationId: string;
  locale?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Without this, an expired/absent session reached `session.user.id` below and threw
    // `TypeError: Cannot read properties of null` — surfacing as an opaque 500 on the payment
    // path instead of a 401 the client can act on by re-authenticating.
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<CheckoutBody>;
    const donationId = String(body.donationId || "").trim();
    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        items: { include: { campaign: { select: { title: true } } } },
        categoryItems: { include: { category: { select: { name: true } } } },
        subscription: true,
      },
    });

    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }
    if (donation.donorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (donation.status === "FAILED") {
      return NextResponse.json(
        { error: `Donation has already failed (status=${donation.status})` },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const locale = (body.locale ?? donation.locale ?? "en").toLowerCase();

    // Build a descriptive product name
    const campaignNames = donation.items.map((i) => i.campaign.title).join(", ");
    const categoryNames = donation.categoryItems.map((i) => i.category.name).join(", ");
    const productName = campaignNames || categoryNames || "Donation";

    // Stripe amount must be in smallest currency unit (cents/kuruş/etc.)
    // For currencies without decimals (e.g. some), multiply by 100 as well.
    const currency = (donation.currency || "USD").toLowerCase();
    const amountInSmallestUnit = Math.round(donation.totalAmount * 100);

    const isMonthly = Boolean(donation.subscriptionId);

    const successUrl = `${origin}/${locale}/success/${donationId}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/${locale}/campaigns?payment=cancelled&donationId=${encodeURIComponent(donationId)}`;

    const metadata: Record<string, string> = {
      donationId,
      userId: session.user.id,
    };
    if (donation.subscriptionId) {
      metadata.subscriptionDbId = donation.subscriptionId;
    }

    let stripeSession: Stripe.Checkout.Session;

    if (isMonthly) {
      // Subscription mode
      stripeSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: productName,
                metadata: { donationId },
              },
              unit_amount: amountInSmallestUnit,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: {
          metadata,
        },
        customer_email: session.user.email ?? undefined,
      });
    } else {
      // One-time payment mode
      stripeSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: productName,
                metadata: { donationId },
              },
              unit_amount: amountInSmallestUnit,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        customer_email: session.user.email ?? undefined,
      });
    }

    // Store the Stripe session ID in the donation record
    await prisma.donation.update({
      where: { id: donationId },
      data: {
        provider: "STRIPE",
        providerOrderId: stripeSession.id,
        locale,
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: "Failed to create Stripe checkout session" }, { status: 500 });
  }
}
