import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// Donate (success) CAPI now fires server-side from `dispatchDonationPaid`
// the moment the donation flips to PAID — that's the only path that
// reliably catches donors whose browser never returns from 3DS (mobile
// tab killed, ad-blocker, slow network, no Pixel ID configured). The
// /success page still triggers /api/donations/:id/track-conversion as a
// fallback claim + to fire the browser Pixel using the same stable
// event_id so Meta dedupes browser ↔ server into one conversion.
// DonateFailed stays here so abandoned-card lookalike audiences still
// get the signal on bank rejects.
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";

export async function POST(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const donationId = searchParams.get("donationId") || "";
  const locale = (searchParams.get("locale") || "en").toLowerCase();

  if (!donationId) {
    return NextResponse.redirect(new URL(`/${locale}/donation-failed`, origin));
  }

  const form = await req.formData();
  const raw = Object.fromEntries(form.entries());

  // Log full bank response for debugging
  console.log("[PayFor OK] Bank response:", JSON.stringify(raw, null, 2));

  const orderId = String(raw.OrderId || raw.orderId || "");
  const procReturnCode = String(raw.ProcReturnCode || raw.ProcReturnCode?.toString?.() || raw.procReturnCode || "");
  const txnResult = String(raw.TxnResult || raw.txnResult || "");
  const errorMessage = String(raw.ErrorMessage || raw.errorMessage || "");
  const authCode = String(raw.AuthCode || raw.authCode || "");
  const hostRefNum = String(raw.HostRefNum || raw.hostRefNum || "");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const donation = await tx.donation.findUnique({
        where: { id: donationId },
        include: {
          items: true,
          categoryItems: true,
        },
      });
      if (!donation) return { ok: false as const, reason: "not_found" as const };

      // Idempotency: if already confirmed by a prior callback, just redirect to success
      if (donation.paidAt !== null) return { ok: true as const };

      // Basic linkage check
      if (donation.providerOrderId && orderId && donation.providerOrderId !== orderId) {
        await tx.donation.update({
          where: { id: donation.id },
          data: {
            status: "FAILED",
            provider: "PAYFOR",
            providerProcReturnCode: procReturnCode || null,
            providerTxnResult: txnResult || null,
            providerAuthCode: authCode || null,
            providerHostRefNum: hostRefNum || null,
            providerErrorMessage: `OrderId mismatch`,
            providerRaw: raw as any,
          },
        });
        return { ok: false as const, reason: "order_mismatch" as const };
      }

      const isSuccess = procReturnCode === "00" || txnResult.toLowerCase() === "success";
      if (!isSuccess) {
        await tx.donation.update({
          where: { id: donation.id },
          data: {
            status: "FAILED",
            provider: "PAYFOR",
            providerProcReturnCode: procReturnCode || null,
            providerTxnResult: txnResult || null,
            providerAuthCode: authCode || null,
            providerHostRefNum: hostRefNum || null,
            providerErrorMessage: errorMessage || "Payment failed",
            providerRaw: raw as any,
          },
        });
        return { ok: false as const, reason: "failed" as const };
      }

      await tx.donation.update({
        where: { id: donation.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          provider: "PAYFOR",
          providerProcReturnCode: procReturnCode || null,
          providerTxnResult: txnResult || null,
          providerAuthCode: authCode || null,
          providerHostRefNum: hostRefNum || null,
          providerErrorMessage: null,
          providerRaw: raw as any,
        },
      });

      // Apply increments only on confirmed payment
      for (const item of donation.items) {
        await tx.campaign.update({
          where: { id: item.campaignId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      for (const item of donation.categoryItems) {
        await tx.category.update({
          where: { id: item.categoryId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }

      return { ok: true as const };
    });

    if (result.ok) {
      void dispatchDonationPaid(donationId);
      return NextResponse.redirect(new URL(`/${locale}/success/${donationId}`, origin));
    }
    if (result.reason === "failed") {
      void dispatchEvent("DONATION_FAILED", { donationId });
      void sendDonationFailedConversions(donationId);
    }
    if (result.reason === "order_mismatch") {
      void sendDonationFailedConversions(donationId);
    }

    return NextResponse.redirect(
      new URL(`/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}`, origin)
    );
  } catch (e) {
    console.error("PayFor OK callback error:", e);
    return NextResponse.redirect(
      new URL(`/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}`, origin)
    );
  }
}

