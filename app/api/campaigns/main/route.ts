import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIncludeInactive } from "@/lib/campaign/include-inactive-query";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";

export async function GET(request: NextRequest) {
  try {
    const includeInactive = parseIncludeInactive(request.nextUrl.searchParams);

    const prioritizedCampaigns = await prisma.campaign.findMany({
      where: {
        AND: [
          { priority: { not: null } },
          includeInactive ? {} : { isActive: true },
          NOT_SOFT_DELETED,
        ].filter((c) => Object.keys(c).length > 0),
      },
      orderBy: { priority: "asc" }, // Order by priority
      include: {
        categories: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
          },
        },
      },
    });

    // Map to add donation count to each campaign using prisma.count and surface
    // the first category in the legacy `category` slot for old consumers.
    const campaignsWithDonationCount = await Promise.all(prioritizedCampaigns.map(async (campaign) => {
      // Counts only items whose parent donation actually settled. Without the `donation`
      // relation filter this counted every item ever written for the campaign — including
      // FAILED and abandoned-checkout rows, and 19 orphaned items whose donation was deleted
      // — and published that inflated figure as the campaign's public donor count.
      const donationCount = await prisma.donationItem.count({
        where: {
          campaignId: campaign.id,
          donation: PAID_DONATION_FILTER,
        },
      });
      return {
        ...campaign,
        category: campaign.categories?.[0] ?? null,
        donationCount, // Add the donation count
      };
    }));

    return NextResponse.json(campaignsWithDonationCount || []);
  } catch (error) {
    console.error("Error fetching prioritized campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch prioritized campaigns. Please try again later." },
      { status: 500 }
    );
  }
} 