import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/stories/admin — the dashboard listing.
 *
 * Unlike the public `/api/stories` this returns inactive and expired rows, so
 * it sits behind the same permission gate as the rest of the dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    void request;

    const rows = await prisma.story.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        image: true,
        linkUrl: true,
        order: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        _count: { select: { translations: true } },
      },
    });

    const now = Date.now();
    const items = rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      image: s.image,
      linkUrl: s.linkUrl ?? "",
      order: s.order,
      isActive: s.isActive,
      startsAt: s.startsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      translationCount: s._count.translations,
      /* The list shows why a story is not on the site, which "isActive" alone
         cannot say: an active story can still be scheduled or expired. */
      expired: s.endsAt ? s.endsAt.getTime() < now : false,
      pending: s.startsAt ? s.startsAt.getTime() > now : false,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}
