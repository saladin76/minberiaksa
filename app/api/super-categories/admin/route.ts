import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/super-categories/admin — the dashboard listing.
 *
 * Returns inactive rows too, so it sits behind the dashboard permission. The
 * linked content and the page's sections come back as counts; the edit page
 * loads the full set.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.superCategory.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        heroImage: true,
        logoImage: true,
        accentColor: true,
        order: true,
        isActive: true,
        _count: { select: { translations: true, items: true, blocks: true } },
      },
    });

    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      heroImage: row.heroImage ?? "",
      logoImage: row.logoImage ?? "",
      accentColor: row.accentColor ?? "",
      order: row.order,
      isActive: row.isActive,
      translationCount: row._count.translations,
      itemCount: row._count.items,
      blockCount: row._count.blocks,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching super categories:", error);
    return NextResponse.json({ error: "Failed to fetch super categories" }, { status: 500 });
  }
}
