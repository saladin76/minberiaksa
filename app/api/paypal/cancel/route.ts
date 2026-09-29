import { NextRequest, NextResponse } from "next/server";
import { isValidLocale } from "@/lib/locales";
import { cancelPayPalCheckout } from "@/lib/donations/paypal-donation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paypal/cancel?donationId=…&locale=…&token=<PayPal order id>
 *
 * The donor backed out on PayPal. Nothing was charged; the pending donation
 * is closed (only when the order id matches the one we created, so a guessed
 * link cannot cancel someone else's payment) and the donor is shown the
 * "payment not completed" page, which offers to try again.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = process.env.APP_URL?.replace(/\/$/, "") ?? url.origin;
  const donationId = url.searchParams.get("donationId") ?? "";
  const localeIn = (url.searchParams.get("locale") ?? "").toLowerCase();
  const locale = isValidLocale(localeIn) ? localeIn : "ar";
  const orderId = url.searchParams.get("token") ?? "";

  if (/^[0-9a-fA-F]{24}$/.test(donationId)) {
    try {
      await cancelPayPalCheckout({ donationId, orderId });
    } catch (error) {
      console.error("[paypal/cancel] error:", error);
    }
  }
  return NextResponse.redirect(
    new URL(donationId ? `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}` : `/${locale}/donation-failed`, origin),
    303
  );
}
