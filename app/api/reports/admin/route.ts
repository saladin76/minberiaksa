import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/reports/admin — the dashboard listing.
 *
 * Unlike the public `/api/reports` this returns unpublished rows, so it sits
 * behind the same permission gate as the rest of the dashboard.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.report.findMany({
      orderBy: [{ year: "desc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        fileUrl: true,
        coverImage: true,
        year: true,
        order: true,
        isPublished: true,
        _count: { select: { translations: true } },
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      fileUrl: r.fileUrl,
      coverImage: r.coverImage ?? "",
      year: r.year ?? null,
      order: r.order,
      isPublished: r.isPublished,
      translationCount: r._count.translations,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
