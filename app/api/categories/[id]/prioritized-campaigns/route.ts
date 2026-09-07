import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { parseCategoryPriorities, getCategoryPriority } from "@/lib/campaign/categories";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";

// GET /api/categories/[id]/prioritized-campaigns
// Returns campaigns belonging to this category whose per-category priority
// is set, ordered ascending by that priority.
//
// The per-category ordering lives in `Campaign.categoryPriorities` as a JSON
// map keyed by categoryId — a campaign can have a different rank in each of
// the categories it belongs to.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
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
// rankings it has in OTHER categories untouched — we only touch this
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
    if (!id) {
      return NextResponse.json({ error: "Category ID required" }, { status: 400 });
    }

    const body = await req.json();
    const { campaigns } = body as { campaigns: { id: string; order: number }[] };

    if (!Array.isArray(campaigns)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // 1. Find every campaign currently ranked in this category and unset that key.
    const previouslyRanked = await prisma.campaign.findMany({
      where: { categoryIds: { has: id } },
      select: { id: true, categoryPriorities: true },
    });

    const clearOps = previouslyRanked
      .map((c) => {
        const map = parseCategoryPriorities(c.categoryPriorities);
        if (!Object.prototype.hasOwnProperty.call(map, id)) return null;
        delete map[id];
        // For a nullable Json field, pass `null` (plain literal) to clear.
        // The Prisma sentinels `Prisma.JsonNull` / `Prisma.DbNull` are only
        // valid when typed as `NullableJsonNullValueInput`; casting through
        // `InputJsonValue` drops that union and the runtime engine rejects
        // the sentinel object as "Expected Json or Null, provided Enum".
        const next: Prisma.InputJsonValue | null =
          Object.keys(map).length > 0
            ? (map as unknown as Prisma.InputJsonValue)
            : null;
        return prisma.campaign.update({
          where: { id: c.id },
          // Cast through `any` because the `data` field's strict union doesn't
          // accept a plain `null` for `Json?` even though the engine does.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { categoryPriorities: next } as any,
        });
      })
      .filter((x): x is ReturnType<typeof prisma.campaign.update> => x !== null);

    // 2. Apply the new rankings — merge into each campaign's existing map.
    // Resolve each campaign's current map first (reads aren't part of the txn),
    // then build the update operations to fold into the single $transaction
    // alongside the clears.
    const applyOps = await Promise.all(
      campaigns.map(async ({ id: campaignId, order }) => {
        const existing = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { categoryPriorities: true },
        });
        const map = parseCategoryPriorities(existing?.categoryPriorities);
        map[id] = order;
        return prisma.campaign.update({
          where: { id: campaignId },
          data: { categoryPriorities: map as unknown as Prisma.InputJsonValue },
        });
      })
    );

    await prisma.$transaction([...clearOps, ...applyOps] as Prisma.PrismaPromise<unknown>[]);

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
    console.error("Error reordering category campaigns:", error);
    return NextResponse.json(
      { error: "Failed to reorder category campaigns" },
      { status: 500 }
    );
  }
}
