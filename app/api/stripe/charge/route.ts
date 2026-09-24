import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { nextChargeAt, normalizeTimezone, type RecurringFrequency } from "@/lib/donations/recurring-schedule";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/**
 * POST /api/stripe/charge — the Stripe half of the Minbar checkout.
 *
 * The order already exists (`POST /api/cart/payment`). This returns the
 * PaymentIntent secret the browser confirms with `stripe.js`, so card data
 * goes from the donor to Stripe and never through this server:
 *
 *  - a one-time gift → a PaymentIntent;
 *  - a monthly plan (the donation carries a `subscriptionId` with
 *    `frequency: MONTHLY`) → a real Stripe Subscription billed monthly, whose
 *    first invoice's PaymentIntent is what the browser confirms.
 *
 * That is Stripe's whole scope here — one-time and monthly, as it always was.
 * Daily and Friday plans are billed by Albaraka (`railForFrequency`) and are
 * refused rather than mis-billed if they reach this route.
 *
 * Until this route knew about plans it created a bare PaymentIntent for every
 * order, so a monthly checkout produced a `Subscription` row with no Stripe
 * subscription behind it — nothing ever renewed (`DEPLOYED_VS_DESIGN_AUDIT.md`
 * § P0.2). Renewals are settled by `invoice.payment_succeeded` in
 * `app/api/stripe/webhook/route.ts`, which looks the plan up by
 * `stripeSubscriptionId` (and, for older rows, `payforToken`).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const body = (await req.json()) as { donationId?: string; locale?: string };
    const donationId = String(body.donationId || "").trim();

    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        items: { include: { campaign: { select: { title: true } } } },
        categoryItems: { include: { category: { select: { name: true } } } },
        subscription: {
          select: { id: true, frequency: true, timezone: true, stripeSubscriptionId: true, payforToken: true },
        },
        donor: { select: { id: true, email: true, name: true } },
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
    if (donation.paidAt) {
      return NextResponse.json({ error: "Donation is already paid" }, { status: 400 });
    }

    const locale = (body.locale ?? donation.locale ?? "en").toLowerCase();
    const currency = (donation.currency || "USD").toLowerCase();
    const amountInSmallestUnit = Math.round(donation.totalAmount * 100);

    const campaignNames = donation.items.map((i) => i.campaign.title).join(", ");
    const categoryNames = donation.categoryItems.map((i) => i.category.name).join(", ");
    const description = campaignNames || categoryNames || "Donation";

    // ── One-time gift: a PaymentIntent the browser confirms ──────────────
    if (!donation.subscription) {
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
    }

    // ── A monthly plan: a Stripe Subscription ────────────────────────────
    const plan = donation.subscription;
    const frequency = plan.frequency as RecurringFrequency;
    if (frequency !== "MONTHLY") {
      return NextResponse.json(
        { error: `A ${frequency.toLowerCase()} plan is billed by Albaraka, not Stripe` },
        { status: 400 }
      );
    }
    const timezone = normalizeTimezone(plan.timezone);
    const now = new Date();

    /* A retry after a declined card must not create a second subscription:
       reuse the one already attached and hand back its open intent. */
    const existingId = plan.stripeSubscriptionId ?? plan.payforToken;
    if (existingId && existingId.startsWith("sub_")) {
      const existing = await stripe.subscriptions.retrieve(existingId, { expand: ["latest_invoice.payment_intent"] });
      const secret = openPaymentSecretOf(existing);
      if (secret) return NextResponse.json({ clientSecret: secret });
    }

    const customerId = await stripeCustomerFor({
      userId: donation.donor.id,
      email: session?.user?.email ?? donation.donor.email,
      name: donation.donor.name,
    });

    /* Subscription `price_data` takes a product id, not inline product data
       (that shape is Checkout-only), so the product is created first — one
       per plan, named for what it funds. */
    const product = await stripe.products.create({
      name: description,
      metadata: { donationId, subscriptionDbId: plan.id },
    });

    /* What every month carries is the plan's amount, not the first payment's:
       the donor may have chosen to give the team support once only, in which
       case it is on the donation but not on the plan. The difference goes on
       the first invoice as a one-off line. */
    const planFees = (plan.amount + plan.teamSupport) * 0.03;
    const planTotal = plan.amount + plan.teamSupport + (plan.coverFees ? planFees : 0);
    const recurringInSmallestUnit = Math.round(planTotal * 100);
    const onceInSmallestUnit = amountInSmallestUnit - recurringInSmallestUnit;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency,
            product: product.id,
            unit_amount: recurringInSmallestUnit > 0 ? recurringInSmallestUnit : amountInSmallestUnit,
            recurring: { interval: "month" },
          },
        },
      ],
      ...(onceInSmallestUnit > 0 && recurringInSmallestUnit > 0
        ? { add_invoice_items: [{ price_data: { currency, product: product.id, unit_amount: onceInSmallestUnit } }] }
        : {}),
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { donationId, userId: donation.donor.id, subscriptionDbId: plan.id, frequency, timezone },
    });

    const clientSecret = openPaymentSecretOf(subscription);
    if (!clientSecret) {
      console.error("[Stripe Charge] subscription has no confirmable intent:", subscription.id);
      return NextResponse.json({ error: "Could not get payment intent" }, { status: 500 });
    }

    const firstInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: plan.id },
        data: {
          provider: "STRIPE",
          stripeSubscriptionId: subscription.id,
          // Kept for the webhook's older lookup path and the admin exports.
          payforToken: subscription.id,
          nextBillingDate: nextChargeAt("MONTHLY", now, timezone),
        },
      }),
      prisma.donation.update({
        where: { id: donationId },
        data: {
          provider: "STRIPE",
          /* The webhook matches the signup invoice on this id. */
          providerOrderId: firstInvoice?.id ?? subscription.id,
          locale,
        },
      }),
    ]);

    return NextResponse.json({ clientSecret });
  } catch (error) {
    console.error("[Stripe Charge] error:", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}

/** The first invoice's PaymentIntent secret while the subscription is still `incomplete`. */
function openPaymentSecretOf(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice as (Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string | null }) | null;
  const intent = invoice?.payment_intent;
  if (intent && typeof intent !== "string" && intent.client_secret && intent.status !== "succeeded") {
    return intent.client_secret;
  }
  return null;
}

/**
 * One Stripe customer per donor, found by our user id in the customer
 * metadata so a guest who gives twice is one customer, not two. The `User`
 * model has no `stripeCustomerId` column — the intent route's write to one is
 * a silent no-op — so the search is the source of truth.
 */
async function stripeCustomerFor(donor: { userId: string; email: string | null; name: string | null }): Promise<string> {
  try {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${donor.userId}'`, limit: 1 });
    if (found.data[0]) return found.data[0].id;
  } catch (err) {
    console.warn("[Stripe Charge] customer search failed, creating:", err);
  }
  const customer = await stripe.customers.create({
    email: donor.email ?? undefined,
    name: donor.name ?? undefined,
    metadata: { userId: donor.userId },
  });
  return customer.id;
}
