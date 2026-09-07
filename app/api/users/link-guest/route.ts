import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { linkGuestUserToTarget } from "@/lib/users/link-guest";

/**
 * Attach a guest-created donation (and every other guest donation under the
 * same anonymous user record) to the currently authenticated user.
 *
 * The donation id is treated as a bearer token here — exactly like
 * /api/donations/[id] does — because the only way the caller learned about
 * the id is by being the donor on the success page (or following an email
 * link sent to that donor). The linkGuestUserToTarget helper then refuses
 * to merge anything that has a password or a linked OAuth account, so the
 * worst a hostile caller can do with a stolen donation id is steal donations
 * that have never been claimed by any real account.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { donationId?: string } | null;
    const donationId = body?.donationId?.trim();
    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: { donorId: true },
    });
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
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
