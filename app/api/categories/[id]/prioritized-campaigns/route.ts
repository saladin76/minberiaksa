import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { getCategoryPriority } from "@/lib/campaign/categories";
import { parseProjectRanks, replaceProjectRanks } from "@/lib/campaign/reorder";
import { revalidatePath } from "next/cache";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";

// GET /api/categories/[id]/prioritized-campaigns
// Returns campaigns belonging to this category whose per-category priority
// is set, ordered ascending by that priority.
//
// The per-category ordering lives in `Campaign.categoryPriorities` as a JSON
// map keyed by categoryId  a campaign can have a different rank in each of
// the categories it belongs to.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Category ID required" }, { status: 400 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        AND: [
          { categoryIds: { has: id } },
          NOT_SOFT_DELETED,
        ],
      },
      select: {
        id: true,
        title: true,
        categoryPriorities: true,
        isActive: true,
      },
    });

    const ranked = campaigns
      .map((c) => ({
        id: c.id,
        title: c.title,
        isActive: c.isActive,
        categoryPriority: getCategoryPriority(c.categoryPriorities, id),
      }))
      .filter((c) => c.categoryPriority != null)
      .sort((a, b) => (a.categoryPriority! - b.categoryPriority!));

    return NextResponse.json(ranked);
  } catch (error) {
    console.error("Error fetching prioritized campaigns for category:", error);
    return NextResponse.json(
      { error: "Failed to fetch prioritized campaigns" },
      { status: 500 }
    );
  }
}

// POST /api/categories/[id]/prioritized-campaigns
// Body: { campaigns: [{ id: string, order: number }] }
//
// Clears the per-category priority for every campaign currently ranked in
// this category, then sets it for the provided list. Each campaign keeps any
// rankings it has in OTHER categories untouched  we only touch this
// category's key inside the JSON map.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Category ID required" }, { status: 400 });
    }

    const body = await req.json();
    const { campaigns } = body as { campaigns: { id: string; order: number }[] };

    const updates = parseProjectRanks(campaigns);
    if (!updates) return NextResponse.json({ error: "ترتيب غير صالح" }, { status: 400 });
    await replaceProjectRanks(prisma, updates, id);
    revalidatePath("/", "layout");

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "CAMPAIGN_CATEGORY_REORDER",
      messageAr: `${actor.actorName ?? "مسؤول"} أعاد ترتيب أولويات المشاريع داخل حملة (${campaigns.length} مشروع)`,
      entityType: "Category",
      entityId: id,
      metadata: { count: campaigns.length, categoryId: id },
    });

    return NextResponse.json({ message: "Reordered successfully" }, { status: 200 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034" || error instanceof Error && error.message === "CONFLICT") return NextResponse.json({ error: "تغير الترتيب أثناء الحفظ. أعد تحميل القائمة." }, { status: 409 });
    if (error instanceof Error && error.message === "INVALID_SCOPE") return NextResponse.json({ error: "اختيار غير صالح" }, { status: 400 });
    console.error("Error reordering category campaigns:", error);
    return NextResponse.json(
      { error: "Failed to reorder category campaigns" },
      { status: 500 }
    );
  }
}
