import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/courses/admin — the dashboard listing.
 *
 * Returns inactive rows too, so it sits behind the dashboard permission. Videos
 * come back as a count; the edit page loads the full set.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.course.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        coverImage: true,
        isPinned: true,
        isExternal: true,
        hasDetailPage: true,
        unitsCount: true,
        order: true,
        isActive: true,
        _count: { select: { translations: true, videos: true } },
      },
    });

    const items = rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      coverImage: c.coverImage ?? "",
      isPinned: c.isPinned,
      isExternal: c.isExternal,
      hasDetailPage: c.hasDetailPage,
      unitsCount: c.unitsCount ?? null,
      order: c.order,
      isActive: c.isActive,
      translationCount: c._count.translations,
      videoCount: c._count.videos,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}
