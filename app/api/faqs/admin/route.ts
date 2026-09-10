import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/faqs/admin — the dashboard listing.
 *
 * Unlike the public route this returns inactive rows and every page scope, so
 * it sits behind the same permission gate as the rest of the dashboard.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.faq.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        question: true,
        answer: true,
        page: true,
        order: true,
        isActive: true,
        _count: { select: { translations: true } },
      },
    });

    const items = rows.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      page: f.page ?? "",
      order: f.order,
      isActive: f.isActive,
      translationCount: f._count.translations,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching faqs:", error);
    return NextResponse.json({ error: "Failed to fetch faqs" }, { status: 500 });
  }
}
