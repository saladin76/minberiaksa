import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { donationTokenMatches } from "@/lib/donations/access-token";
import { startPayPalCheckout } from "@/lib/donations/paypal-donation";
import { PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/orders  { donationId, locale, t? }
 *
 * Creates the PayPal order for a donation the checkout has just created and
 * returns the URL to send the donor to. Only the donation id travels from the
 * browser: the amount and currency are read from the database.
 *
 * The caller must own the donation  their session, or for a guest the
 * donation's access token (`t`), which the order API handed the checkout.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { donationId?: unknown; locale?: unknown; t?: unknown };
    const donationId = typeof body.donationId === "string" ? body.donationId.trim() : "";
    if (!/^[0-9a-fA-F]{24}$/.test(donationId)) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }
    const localeIn = typeof body.locale === "string" ? body.locale.toLowerCase() : "";
    const locale = isValidLocale(localeIn) ? localeIn : "ar";

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: { donorId: true, accessToken: true },
    });
    if (!donation) return NextResponse.json({ error: "Donation not found" }, { status: 404 });

    const session = await getServerSession(authOptions);
    const isOwner = Boolean(session?.user?.id && session.user.id === donation.donorId);
    const hasToken = donationTokenMatches(donation.accessToken, typeof body.t === "string" ? body.t : null);
    if (!isOwner && !hasToken) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const origin = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    const result = await startPayPalCheckout({ donationId, origin, locale });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ approveUrl: result.approveUrl });
  } catch (error) {
    console.error("[paypal/orders] create failed:", error instanceof PayPalError ? { message: error.message, body: error.body } : error);
    return NextResponse.json({ error: "Could not start the PayPal payment" }, { status: 502 });
  }
}
