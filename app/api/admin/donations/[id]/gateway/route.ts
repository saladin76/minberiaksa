import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { sessionHasDashboardPermission } from "@/lib/dashboard/permissions";
import { flattenGatewayRaw } from "@/lib/donations/gateway-raw";
import { getPayPalOrder, isPayPalConfigured } from "@/lib/paypal";
import { gatewayDisplayAmounts, inspectPayPalCheckout } from "@/lib/donations/gateway-diagnostics";

/**
 * What the payment gateway told us about one donation  the references a
 * finance user needs to find the transaction in Albaraka's, Ziraat Katılım's
 * (PayFor), PayPal's or Stripe's own panel, and the gateway's raw answer.
 *
 * Fetched on demand by the gateway popup in the donation tables, so the tables
 * never carry `providerRaw`. Readable by anyone who can see one of those tables.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = (["revenue", "monthly", "referrals"] as const).some((p) => sessionHasDashboardPermission(session, p));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const donation = await prisma.donation.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      totalAmount: true,
      amountUSD: true,
      paidAmount: true,
      paidCurrency: true,
      createdAt: true,
      paidAt: true,
      paymentMethod: true,
      provider: true,
      providerOrderId: true,
      providerTxnType: true,
      providerProcReturnCode: true,
      providerTxnResult: true,
      providerAuthCode: true,
      providerHostRefNum: true,
      providerErrorMessage: true,
      providerRaw: true,
      paypalOrderId: true,
      paypalCaptureId: true,
      billingReason: true,
      subscription: { select: { id: true, stripeSubscriptionId: true, payforMaskedPan: true, frequency: true } },
    },
  });
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { entries: raw, truncated: rawTruncated } = flattenGatewayRaw(donation.providerRaw);

  const amounts = gatewayDisplayAmounts(donation);
  // Viewing a donation must never capture, settle, fail or notify. Checkout/cron own those actions.
  const paypalInspection = donation.paymentMethod === "PAYPAL" && !donation.paidAt && donation.status !== "FAILED"
    ? await inspectPayPalCheckout(donation, { configured: isPayPalConfigured(), readOrder: getPayPalOrder })
    : null;

  return NextResponse.json({
    id: donation.id,
    provider: donation.provider,
    paymentMethod: donation.paymentMethod,
    status: donation.status,
    amount: donation.amount,
    currency: donation.currency,
    totalAmount: donation.totalAmount,
    amountUSD: donation.amountUSD,
    ...amounts,
    paypalInspection,
    createdAt: donation.createdAt,
    paidAt: donation.paidAt,
    billingReason: donation.billingReason,
    refs: {
      providerOrderId: donation.providerOrderId,
      providerAuthCode: donation.providerAuthCode,
      providerHostRefNum: donation.providerHostRefNum,
      paypalOrderId: donation.paypalOrderId,
      paypalCaptureId: donation.paypalCaptureId,
      stripeSubscriptionId: donation.subscription?.stripeSubscriptionId ?? null,
      subscriptionId: donation.subscription?.id ?? null,
      maskedPan: donation.subscription?.payforMaskedPan ?? null,
    },
    txn: {
      type: donation.providerTxnType,
      result: donation.providerTxnResult,
      returnCode: donation.providerProcReturnCode,
      errorMessage: donation.providerErrorMessage,
    },
    raw,
    rawTruncated,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
