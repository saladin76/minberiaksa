import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/urgent-banners/admin — the dashboard listing.
 *
 * Returns inactive, scheduled and expired rows, so it sits behind the dashboard
 * permission. The campaign title is joined so the list can name where a banner
 * points without a second request per row.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.urgentBanner.findMany({
      orderBy: { priority: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        image: true,
        ctaUrl: true,
        campaignId: true,
        priority: true,
        locales: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        _count: { select: { translations: true } },
      },
    });

    /* campaignId is a soft reference, so the join is done by hand. One query
       for every referenced campaign, not one per banner. */
    const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter((v): v is string => !!v))];
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, title: true } })
      : [];
    const titleById = new Map(campaigns.map((c) => [c.id, c.title]));

    const now = Date.now();
    const items = rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      image: b.image ?? "",
      ctaUrl: b.ctaUrl ?? "",
      campaignId: b.campaignId ?? null,
      campaignTitle: b.campaignId ? (titleById.get(b.campaignId) ?? null) : null,
      priority: b.priority,
      locales: b.locales,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
      isActive: b.isActive,
      translationCount: b._count.translations,
      /* Why a banner is not showing, which isActive alone cannot say. */
      expired: b.endsAt ? b.endsAt.getTime() < now : false,
      pending: b.startsAt ? b.startsAt.getTime() > now : false,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching urgent banners:", error);
    return NextResponse.json({ error: "Failed to fetch urgent banners" }, { status: 500 });
  }
}
