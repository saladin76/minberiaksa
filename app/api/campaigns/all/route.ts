import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/options';
import { requireAdminOrDashboardPermission } from '@/lib/dashboard/api-auth';
import { parseIncludeInactive } from '@/lib/campaign/include-inactive-query';
import { NOT_SOFT_DELETED } from '@/lib/campaign/soft-delete-filter';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'campaigns');
    if (denied) return denied;

    const includeInactive = parseIncludeInactive(request.nextUrl.searchParams);

    const campaigns = await prisma.campaign.findMany({
      where: {
        // Soft-deleted campaigns are never returned, even when the caller
        // asks for inactive ones (the dashboard archive view).
        AND: [
          includeInactive ? {} : { isActive: true },
          NOT_SOFT_DELETED,
        ].filter((c) => Object.keys(c).length > 0),
      },
      include: {
        // `donations: { select: { amount, createdAt } }` used to be joined here,
        // which loaded EVERY settled DonationItem for EVERY campaign on every
        // dashboard list render — and no caller ever read it (the pages use the
        // pre-aggregated `currentAmount` column). Dropping it is the single
        // biggest win on the campaigns list; the running total is unaffected.
        categories: true, // Include all categories (m2m)
      },
      orderBy: { createdAt: 'desc' },
    });

    // Preserve the legacy `category` field shape for callers that still expect
    // a single category (e.g. the admin /dashboard/campaigns table). It points
    // at the first selected category so the existing UI keeps rendering.
    const out = campaigns.map((c) => ({
      ...c,
      category: c.categories?.[0] ?? null,
    }));

    return NextResponse.json(out);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}