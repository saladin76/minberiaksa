import { enforcePaymentInitiationBudget } from "@/lib/site-security/payment-initiation-budget";
import { frozenPaymentRoute } from "@/lib/donations/payment-routing";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { withDonationToken } from "@/lib/donations/access-token";
import Stripe from "stripe";
import { toStripeMinorUnits } from "@/lib/stripe-amount";

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
    // `TypeError: Cannot read properties of null`  surfacing as an opaque 500 on the payment
    // path instead of a 401 the client can act on by re-authenticating.
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<CheckoutBody>;
    const donationId = String(body.donationId || "").trim();
    const abuseGate = await enforcePaymentInitiationBudget(req, donationId);
    if (abuseGate) return abuseGate;
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
    const frozenRoute = frozenPaymentRoute(donation.providerRaw);
    if (frozenRoute && frozenRoute.gateway !== "STRIPE") return NextResponse.json({ error: "This payment attempt belongs to another gateway", code: "PAYMENT_GATEWAY_LOCKED" }, { status: 409 });
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
    const amountInSmallestUnit = toStripeMinorUnits(donation.totalAmount, currency);

    const isMonthly = Boolean(donation.subscriptionId);

    const successUrl = withDonationToken(`${origin}/${locale}/success/${donationId}?session_id={CHECKOUT_SESSION_ID}`, donation.accessToken);
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
      const plan = donation.subscription!;
      if (plan.frequency !== "MONTHLY" || (plan.provider && plan.provider !== "STRIPE")) {
        return NextResponse.json({ error: "This recurring plan uses another payment provider" }, { status: 400 });
      }
      const principal = plan.amount + plan.teamSupport;
      const recurringAmount = toStripeMinorUnits(principal + (plan.coverFees ? principal * 0.03 : 0), currency);
      const oneTimeAmount = amountInSmallestUnit - recurringAmount;
      if (recurringAmount <= 0 || oneTimeAmount < 0) return NextResponse.json({ error: "Invalid initial or recurring amount" }, { status: 400 });
      // One combined initial payment; only the recurring price survives on the subscription.
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
              unit_amount: recurringAmount,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
          ...(oneTimeAmount > 0 ? [{ price_data: { currency, product_data: { name: productName + " (one-time)" }, unit_amount: oneTimeAmount }, quantity: 1 }] : []),
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
