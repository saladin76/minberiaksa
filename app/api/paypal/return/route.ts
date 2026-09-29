import { NextRequest, NextResponse } from "next/server";
import { isValidLocale } from "@/lib/locales";
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
  const origin = process.env.APP_URL?.replace(/\/$/, "") ?? url.origin;
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
    return NextResponse.redirect(failed, 303);
  }
}
