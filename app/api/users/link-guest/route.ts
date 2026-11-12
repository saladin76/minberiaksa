import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { linkGuestUserToTarget } from "@/lib/users/link-guest";
import { donationTokenMatches } from "@/lib/donations/access-token";

/**
 * Attach guest donations to the current account only when the caller proves
 * possession of the donation's high-entropy receipt bearer. A donation ID is
 * public-facing and is NEVER proof of ownership.
 *
 * The existing guest-only check in linkGuestUserToTarget is a separate guard,
 * not a substitute for verifying the receipt token before ANY merge.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { donationId?: unknown; accessToken?: unknown } | null;
    const donationId = typeof body?.donationId === "string" ? body.donationId.trim() : "";
    if (!/^[a-f0-9]{24}$/i.test(donationId)) {
      return NextResponse.json({ error: "Valid donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: { donorId: true, accessToken: true },
    });
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    // Idempotent when already linked to the authenticated account. A caller
    // cannot transfer another donor's history using a known donation ID.
    if (donation.donorId === session.user.id) {
      return NextResponse.json({ success: true, movedDonations: 0, alreadyLinked: true });
    }
    const token = typeof body?.accessToken === "string" ? body.accessToken : null;
    if (!donationTokenMatches(donation.accessToken, token)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await linkGuestUserToTarget(donation.donorId, session.user.id);
    if (!result.ok) {
      const status = result.reason === "GUEST_NOT_ELIGIBLE" ? 409 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({
      success: true,
      movedDonations: result.movedDonations,
      alreadyLinked: result.alreadyLinked ?? false,
    });
  } catch (error) {
    console.error("[link-guest]", error);
    return NextResponse.json({ error: "Failed to link guest donation" }, { status: 500 });
  }
}
