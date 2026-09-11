import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";

/** Guards against a malformed or unbounded payload reaching the transaction. */
const MAX_REORDER_ITEMS = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const { superCategories } = await req.json();
    if (!Array.isArray(superCategories)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (superCategories.length === 0) {
      return NextResponse.json({ message: "Nothing to reorder" }, { status: 200 });
    }
    if (superCategories.length > MAX_REORDER_ITEMS) {
      return NextResponse.json({ error: "عدد الأقسام كبير جدًا" }, { status: 400 });
    }

    /* Validate the whole payload before writing any of it: one entry with a
       missing id would otherwise fail the transaction half-way through. */
    const updates: { id: string; order: number }[] = [];
    for (const raw of superCategories) {
      const id = raw?.id;
      const order = raw?.order;
      if (typeof id !== "string" || !id || typeof order !== "number" || !Number.isFinite(order)) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }
      updates.push({ id, order });
    }

    await prisma.$transaction(
      updates.map(({ id, order }) => prisma.superCategory.update({ where: { id }, data: { order } }))
    );

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SUPER_CATEGORY_REORDER",
      messageAr: `${actor.actorName ?? "مسؤول"} أعاد ترتيب الأقسام الكبرى (${updates.length})`,
      entityType: "SuperCategory",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering super categories:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ الترتيب") },
      { status: 500 }
    );
  }
}
