import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchEvent } from "@/lib/events/dispatch";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";

/**
 * Mark a donation as FAILED.
 *
 * Called from the browser when a payment provider returns an inline error
 * (e.g. Stripe Elements `confirmPayment` rejects the card) so the row can't be
 * left dangling at status=PAID. Idempotent — re-marking an already-FAILED
 * donation is a no-op, and we never overwrite a donation that has already
 * been confirmed paid (paidAt is set).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing donation id" }, { status: 400 });
  }

  let reason = "client_reported_failure";
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.reason === "string" && body.reason.length <= 500) {
      reason = body.reason;
    }
  } catch {
    /* fall through with default reason */
  }

  try {
    const donation = await prisma.donation.findUnique({
      where: { id },
      select: { id: true, status: true, paidAt: true },
    });

    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    // Don't downgrade a confirmed payment — a webhook may have already marked it PAID.
    if (donation.paidAt) {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    if (donation.status === "FAILED") {
      return NextResponse.json({ ok: true, alreadyFailed: true });
    }

    await prisma.donation.update({
      where: { id },
      data: {
        status: "FAILED",
        providerErrorMessage: reason,
        providerTxnResult: "Failed",
      },
    });
    void dispatchEvent("DONATION_FAILED", { donationId: id });
    // Seed Meta with the failed attempt — browser pixel fires the matching
    // DonateFailed hit with event_id `${id}_failed` so the pair deduplicates.
    void sendDonationFailedConversions(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[donations/:id/fail] Error:", err);
    return NextResponse.json({ error: "Failed to mark donation" }, { status: 500 });
  }
}
