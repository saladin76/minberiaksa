import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // A campaign is linked through DonationItem — `Donation` has no `campaignId`, so the
    // previous `where: { campaignId: id }` threw on every request and this widget has never
    // rendered. Also restricted to genuinely paid donations: this list is public-facing, and
    // abandoned checkouts (status=PAID, never settled) must not appear as donors.
    const recentDonations = await prisma.donation.findMany({
      where: {
        AND: [{ items: { some: { campaignId: id } } }, PAID_DONATION_FILTER],
      },
      include: {
        donor: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    return NextResponse.json(recentDonations);
  } catch (error) {
    console.error("Error fetching recent donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent donations" },
      { status: 500 }
    );
  }
}