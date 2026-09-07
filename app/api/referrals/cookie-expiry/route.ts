import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidReferralCode } from "@/lib/referral";

/**
 * GET /api/referrals/cookie-expiry?code=xxx
 * Public: returns cookie expiry in days for the given referral code.
 * 0 = unlimited. Used by ReferralTracker to set the cookie max-age.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim();
    if (!code || !isValidReferralCode(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    const referral = await prisma.referral.findUnique({
      where: { code: code.toLowerCase() },
      select: { cookieExpiryDays: true },
    });
    if (!referral) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }
    // Existing referrals may lack cookieExpiryDays; default 30
    const cookieExpiryDays = referral.cookieExpiryDays ?? 30;
    return NextResponse.json({ cookieExpiryDays });
  } catch (error) {
    console.error("Error fetching referral cookie expiry:", error);
    return NextResponse.json(
      { error: "Failed to fetch" },
      { status: 500 }
    );
  }
}
