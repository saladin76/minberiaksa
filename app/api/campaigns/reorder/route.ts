import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { parseProjectRanks, replaceProjectRanks } from "@/lib/campaign/reorder";
import { revalidatePath } from "next/cache";


export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const body = await req.json();
    const { campaigns } = body;

    const updates = parseProjectRanks(campaigns);
    if (!updates) return NextResponse.json({ error: "ترتيب غير صالح" }, { status: 400 });
    await replaceProjectRanks(prisma, updates);
    revalidatePath("/", "layout");

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
    if ((error as { code?: string }).code === "P2034" || error instanceof Error && error.message === "CONFLICT") return NextResponse.json({ error: "تغير الترتيب أثناء الحفظ. أعد تحميل القائمة." }, { status: 409 });
    if (error instanceof Error && error.message === "INVALID_SCOPE") return NextResponse.json({ error: "اختيار غير صالح" }, { status: 400 });
    console.error("Error reordering campaigns:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ الترتيب") },
      { status: 500 }
    );
  }
}
