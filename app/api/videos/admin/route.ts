import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { isVideoType } from "@/lib/content/video-write";

/**
 * GET /api/videos/admin — the dashboard listing.
 *
 * Unlike the public `/api/videos` this returns inactive rows and ignores
 * `localeFilter`, so it sits behind the same permission gate as the rest of the
 * dashboard. `?type=` narrows it to one tab.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const typeParam = request.nextUrl.searchParams.get("type");
    const type = isVideoType(typeParam) ? typeParam : undefined;

    const rows = await prisma.video.findMany({
      where: type ? { type } : {},
      orderBy: [{ type: "asc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        type: true,
        title: true,
        youtubeId: true,
        url: true,
        thumbnail: true,
        regionKey: true,
        localeFilter: true,
        showOnHome: true,
        order: true,
        isActive: true,
        _count: { select: { translations: true } },
      },
    });

    const items = rows.map((v) => ({
      id: v.id,
      slug: v.slug,
      type: v.type,
      title: v.title,
      youtubeId: v.youtubeId ?? "",
      url: v.url ?? "",
      thumbnail: v.thumbnail ?? "",
      regionKey: v.regionKey ?? "",
      localeFilter: v.localeFilter,
      showOnHome: v.showOnHome,
      order: v.order,
      isActive: v.isActive,
      translationCount: v._count.translations,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}
