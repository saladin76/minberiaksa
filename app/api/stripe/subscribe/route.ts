import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("[Stripe Subscribe] STRIPE_SECRET_KEY is not set");
      return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

    const session = await getServerSession(authOptions);
    

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
        subscription: true,
        donor: { select: { email: true } },
      },
    });

    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }
    // Authenticated users: verify ownership. Guests have no session — trust the donationId.
    if (session?.user?.id && donation.donorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (donation.status === "FAILED") {
      return NextResponse.json(
        { error: `Donation has already failed (status=${donation.status})` },
        { status: 400 }
      );
    }

    const locale = (body.locale ?? donation.locale ?? "en").toLowerCase();
    const currency = (donation.currency || "USD").toLowerCase();
    const amountInSmallestUnit = Math.round(donation.totalAmount * 100);

    const campaignNames = donation.items.map((i) => i.campaign.title).join(", ");
    const categoryNames = donation.categoryItems.map((i) => i.category.name).join(", ");
    const productName = campaignNames || categoryNames || "Monthly Donation";

    console.log("[Stripe Subscribe] creating customer, currency:", currency, "amount:", amountInSmallestUnit);

    const donorEmail = session?.user?.email ?? (donation as typeof donation & { donor: { email: string | null } }).donor?.email ?? undefined;
    const donorUserId = session?.user?.id ?? donation.donorId;

    // Create a Stripe Customer for this subscription
    const customer = await stripe.customers.create({
      email: donorEmail,
      metadata: { userId: donorUserId },
    });

    console.log("[Stripe Subscribe] creating product:", productName);
    const product = await stripe.products.create({ name: productName });

    console.log("[Stripe Subscribe] creating price");
    const price = await stripe.prices.create({
      currency,
      unit_amount: amountInSmallestUnit,
      recurring: { interval: "month" },
      product: product.id,
    });

    console.log("[Stripe Subscribe] creating subscription, price:", price.id);
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        donationId,
        userId: donorUserId,
        ...(donation.subscriptionId ? { subscriptionDbId: donation.subscriptionId } : {}),
      },
    });

    // Store Stripe subscription ID in payforToken field so webhook can find it
    if (donation.subscriptionId) {
      await prisma.subscription.update({
        where: { id: donation.subscriptionId },
        data: { payforToken: subscription.id },
      });
    }

    const invoice = subscription.latest_invoice as Stripe.Invoice & {
      payment_intent: Stripe.PaymentIntent | null;
    };
    const clientSecret = invoice?.payment_intent?.client_secret;

    if (!clientSecret) {
      console.error("[Stripe Subscribe] no clientSecret in invoice:", invoice?.id);
      return NextResponse.json({ error: "Could not get payment intent" }, { status: 500 });
    }

    await prisma.donation.update({
      where: { id: donationId },
      data: { provider: "STRIPE", providerOrderId: invoice.id || subscription.id, locale },
    });

    console.log("[Stripe Subscribe] success, subscription:", subscription.id);
    return NextResponse.json({ clientSecret });
  } catch (error) {
    console.error("[Stripe Subscribe] error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
