import { NextRequest, NextResponse } from "next/server";
import { isValidLocale } from "@/lib/locales";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { withDonationToken } from "@/lib/donations/access-token";
import { completePayPalReturn } from "@/lib/donations/paypal-donation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paypal/return?donationId=…&locale=…&token=<PayPal order id>&PayerID=…
 *
 * PayPal sends the donor here after they approve. The order is captured and
 * verified server-side (`completePayPalReturn`); only then is the donor sent
 * to the success page. Arriving here proves nothing by itself.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = paymentPublicOrigin(req.url);
  const donationId = url.searchParams.get("donationId") ?? "";
  const localeIn = (url.searchParams.get("locale") ?? "").toLowerCase();
  const locale = isValidLocale(localeIn) ? localeIn : "ar";
  const orderId = url.searchParams.get("token") ?? "";

  const failed = new URL(
    donationId ? `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}` : `/${locale}/donation-failed`,
    origin
  );
  if (!/^[0-9a-fA-F]{24}$/.test(donationId)) return NextResponse.redirect(failed, 303);

  try {
    const result = await completePayPalReturn({ donationId, orderId });
    if (result.kind === "paid") {
      return NextResponse.redirect(new URL(withDonationToken(`/${locale}/success/${donationId}`, result.accessToken), origin), 303);
    }
    if (result.kind === "pending") {
      return NextResponse.redirect(
        new URL(withDonationToken(`/${locale}/payment-processing?donationId=${encodeURIComponent(donationId)}`, result.accessToken), origin),
        303
      );
    }
    return NextResponse.redirect(failed, 303);
  } catch (error) {
    console.error("[paypal/return] error:", error);
    // A write conflict with PayPal's own notification can fail this request while the donation is in fact paid:
    // four donors were shown "donation failed" after paying on 2026-11-20. Look at the donation before saying so.
    // Nothing is captured or written here; a real failure (FAILED) still goes to the failure page.
    if (orderId) {
      const after = await settledOutcome(donationId).catch(() => null);
      if (after?.paid) return NextResponse.redirect(new URL(withDonationToken(`/${locale}/success/${donationId}`, after.accessToken), origin), 303);
      if (after) {
        return NextResponse.redirect(
          new URL(withDonationToken(`/${locale}/payment-processing?donationId=${encodeURIComponent(donationId)}`, after.accessToken), origin),
          303
        );
      }
    }
    return NextResponse.redirect(failed, 303);
  }
}

/** Read-only: the donation's state for up to ~3 s. PAID → paid; FAILED or missing → null; otherwise still settling. */
async function settledOutcome(donationId: string): Promise<{ paid: boolean; accessToken: string | null } | null> {
  const { prisma } = await import("@/lib/prisma");
  let row: { status: string; paidAt: Date | null; accessToken: string | null } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    row = await prisma.donation.findUnique({ where: { id: donationId }, select: { status: true, paidAt: true, accessToken: true } });
    if (!row || row.status === "FAILED") return null;
    if (row.status === "PAID" && row.paidAt) return { paid: true, accessToken: row.accessToken };
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return row ? { paid: false, accessToken: row.accessToken } : null;
}
