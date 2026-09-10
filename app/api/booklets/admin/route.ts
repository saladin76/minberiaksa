import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/booklets/admin — the dashboard listing.
 *
 * Unlike the public route this returns unpublished rows, so it sits behind the
 * same permission gate as the rest of the dashboard.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.booklet.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        fileUrl: true,
        coverImage: true,
        order: true,
        isPublished: true,
        _count: { select: { translations: true } },
      },
    });

    const items = rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      fileUrl: b.fileUrl,
      coverImage: b.coverImage ?? "",
      // The shared list component renders one row shape; booklets have no year.
      year: null,
      order: b.order,
      isPublished: b.isPublished,
      translationCount: b._count.translations,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching booklets:", error);
    return NextResponse.json({ error: "Failed to fetch booklets" }, { status: 500 });
  }
}
