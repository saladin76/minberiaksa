import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";

/** Guards against a malformed or unbounded payload reaching the transaction. */
const MAX_REORDER_ITEMS = 500;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const body = await req.json();
    const { campaigns } = body;

    if (!Array.isArray(campaigns)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }
    if (campaigns.length === 0) {
      return NextResponse.json({ message: "Nothing to reorder" }, { status: 200 });
    }
    if (campaigns.length > MAX_REORDER_ITEMS) {
      return NextResponse.json({ error: "عدد المشاريع كبير جدًا" }, { status: 400 });
    }

    // Validate up front. An entry missing an id or carrying a non-numeric order
    // used to reach Prisma and fail the transaction part-way through.
    const updates: { id: string; order: number }[] = [];
    for (const raw of campaigns) {
      const id = raw?.id;
      const order = raw?.order;
      if (typeof id !== "string" || !id || typeof order !== "number" || !Number.isFinite(order)) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      updates.push({ id, order });
    }

    await prisma.$transaction(
      updates.map(({ id, order }) =>
        prisma.campaign.update({
          where: { id },
          data: { priority: order },
        })
      )
    );

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "CAMPAIGN_REORDER",
      messageAr: `${actor.actorName ?? "مسؤول"} أعاد ترتيب أولويات المشاريع (${updates.length} مشروع)`,
      entityType: "Campaign",
      metadata: { count: updates.length },
    });

    return NextResponse.json(
      { message: "Campaigns reordered successfully" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error reordering campaigns:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ الترتيب") },
      { status: 500 }
    );
  }
}
