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

    // Load all donor counts in one aggregate query. The previous implementation ran
    // one donationItem.count() per campaign, which created an N+1 query pattern and
    // made this public endpoint disproportionately slow under even light concurrency.
    const donationCounts = prioritizedCampaigns.length
      ? await prisma.donationItem.groupBy({
          by: ["campaignId"],
          where: {
            campaignId: { in: prioritizedCampaigns.map((campaign) => campaign.id) },
            donation: PAID_DONATION_FILTER,
          },
          _count: { id: true },
        })
      : [];

    const donationCountByCampaign = new Map(
      donationCounts.map((row) => [row.campaignId, row._count.id]),
    );

    const campaignsWithDonationCount = prioritizedCampaigns.map((campaign) => ({
      ...campaign,
      category: campaign.categories?.[0] ?? null,
      donationCount: donationCountByCampaign.get(campaign.id) ?? 0,
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