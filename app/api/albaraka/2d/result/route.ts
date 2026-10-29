import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { donationTokenMatches, withDonationToken } from "@/lib/donations/access-token";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/albaraka/2d/result?donationId&locale&t
 *
 * Where the checkout sends the browser after a 2D Albaraka sale. The sale was
 * settled (or failed) server-side by `/api/albaraka/3d/initiate`; this only
 * reads the donation's real status and redirects to the success or failure
 * page. The checkouts submit a form here, so POST is accepted as well.
 *
 * The success page link carries the donation's access token, so it is handed
 * out only to a caller that presented it (a guest) or when the donation has
 * none (a signed-in donor, whose session opens the page).
 */
async function handle(req: NextRequest) {
  const origin = paymentPublicOrigin(req.url);
  const { searchParams } = new URL(req.url);
  const donationId = searchParams.get("donationId") || "";
  const locale = (searchParams.get("locale") || "en").toLowerCase().replace(/[^a-z-]/g, "") || "en";
  const presented = searchParams.get("t");

  const failUrl = new URL(
    donationId ? `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}` : `/${locale}/donation-failed`,
    origin
  );
  // A form POST lands here; 303 makes the browser follow with a GET.
  const redirect = (url: URL) => NextResponse.redirect(url, 303);

  if (!/^[0-9a-fA-F]{24}$/.test(donationId)) return redirect(failUrl);

  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { paidAt: true, accessToken: true, status: true },
  });
  if (!donation || (!donation.paidAt && donation.status === "FAILED")) return redirect(failUrl);

  if (donation.accessToken && !donationTokenMatches(donation.accessToken, presented)) {
    return redirect(new URL(donation.paidAt ? `/${locale}/success/${donationId}` : `/${locale}/payment-processing?donationId=${encodeURIComponent(donationId)}`, origin));
  }
  return redirect(new URL(withDonationToken(donation.paidAt ? `/${locale}/success/${donationId}` : `/${locale}/payment-processing?donationId=${encodeURIComponent(donationId)}`, donation.accessToken), origin));
}

export const GET = handle;
export const POST = handle;
