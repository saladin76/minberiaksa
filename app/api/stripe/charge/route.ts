import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

// POST /api/stripe/charge
// Creates a PaymentIntent for the given donation and returns its clientSecret.
// The client then calls stripe.confirmCardPayment(clientSecret, { payment_method: { card: rawData } })
// so card data goes directly from browser to Stripe — never through this server.
export async function POST(req: NextRequest) {
  try {
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
    const description = campaignNames || categoryNames || "Donation";

    // Create PaymentIntent without confirming — client confirms with raw card data via stripe.js
    const intent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency,
      description,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { donationId, userId: session?.user?.id ?? donation.donorId },
    });

    await prisma.donation.update({
      where: { id: donationId },
      data: { provider: "STRIPE", providerOrderId: intent.id, locale },
    });

    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (error) {
    console.error("[Stripe Charge] error:", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
