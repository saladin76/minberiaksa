import { runAfterResponse } from "@/lib/events/after-response";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchEvent } from "@/lib/events/dispatch";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { mergePayForProviderRaw, payForErrorMessage, redactPayForResponse } from "@/lib/payfor";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { isValidLocale } from "@/lib/locales";

export async function POST(req: NextRequest) {
  const origin = paymentPublicOrigin(req.url);
  const redirect = (url: URL) => NextResponse.redirect(url, 303);
  const { searchParams } = new URL(req.url);
  const donationId = searchParams.get("donationId") || "";
  const requestedLocale = (searchParams.get("locale") || "en").toLowerCase();
  const locale = isValidLocale(requestedLocale) ? requestedLocale : "en";

  if (!donationId) {
    return redirect(new URL(`/${locale}/donation-failed`, origin));
  }

  const form = await req.formData();
  const raw = Object.fromEntries(form.entries());

  console.error("[PayFor FAIL] Bank response:", JSON.stringify(redactPayForResponse(raw), null, 2));

  const orderId = String(raw.OrderId || raw.orderId || "");
  const procReturnCode = String(raw.ProcReturnCode || raw.procReturnCode || "");
  const txnResult = String(raw.TxnResult || raw.txnResult || "");
  const errorMessage = payForErrorMessage(raw) || "Payment failed";

  try {
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
    });

    if (donation && donation.paidAt === null) {
      await prisma.donation.update({
        where: { id: donationId },
        data: {
          status: "FAILED",
          provider: "PAYFOR",
          providerOrderId: donation.providerOrderId ?? orderId ?? null,
          providerProcReturnCode: procReturnCode || null,
          providerTxnResult: txnResult || null,
          providerErrorMessage: errorMessage || null,
          providerRaw: mergePayForProviderRaw(donation.providerRaw, raw) as Prisma.InputJsonValue,
        },
      });
      runAfterResponse(() => dispatchEvent("DONATION_FAILED", { donationId }));
      // Seed Meta with the failed attempt so lookalike audiences can include
      // donors-who-tried. Browser pixel fires the matching DonateFailed hit
      // with event_id `${donationId}_failed`  same id here for dedup.
      void sendDonationFailedConversions(donationId);
    }
  } catch (e) {
    console.error("[PayFor FAIL] Callback error:", e);
  }

  return redirect(
    new URL(
      `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}`,
      origin
    )
  );
}
