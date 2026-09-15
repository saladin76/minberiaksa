import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";

/**
 * POST /api/urgent-banners/reorder — `{ banners: [{ id, order }] }` from the
 * drag-and-drop list. `order` becomes `priority`, the ascending sort within
 * every slot. Same contract as the courses / FAQ reorder routes.
 */
const MAX_REORDER_ITEMS = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const { banners } = await req.json();
    if (!Array.isArray(banners)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (banners.length === 0) return NextResponse.json({ message: "Nothing to reorder" }, { status: 200 });
    if (banners.length > MAX_REORDER_ITEMS) return NextResponse.json({ error: "عدد البانرات كبير جدًا" }, { status: 400 });

    /* Validate the whole payload before writing any of it. */
    const updates: { id: string; order: number }[] = [];
    for (const raw of banners) {
      const id = raw?.id;
      const order = raw?.order;
      if (typeof id !== "string" || !id || typeof order !== "number" || !Number.isFinite(order)) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }
      updates.push({ id, order });
    }

    await prisma.$transaction(
      updates.map(({ id, order }) => prisma.urgentBanner.update({ where: { id }, data: { priority: order } }))
    );

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "URGENT_BANNER_REORDER",
      messageAr: `${actor.actorName ?? "مسؤول"} أعاد ترتيب البانرات (${updates.length})`,
      entityType: "UrgentBanner",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering urgent banners:", error);
    return NextResponse.json({ error: writeErrorMessage(error, "تعذّر حفظ الترتيب") }, { status: 500 });
  }
}
