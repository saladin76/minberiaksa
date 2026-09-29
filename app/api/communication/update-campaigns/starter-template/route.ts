import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createStarterUpdateTemplate } from "@/lib/communication/update-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST  create the ready-made "project update" email template (Arabic +
 * English): the update's campaign and date, title, photo (or video still),
 * text, a "watch the video" button, a thank-you line and a link back to the
 * project. An ordinary template afterwards  edited in the templates page,
 * where the {{update.*}} variables can be moved anywhere.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const actor = auditActorFromDashboardSession(session!);
  try {
    const template = await createStarterUpdateTemplate(actor);
    await writeAuditLog({
      ...actor,
      action: "communication.template.update-starter.create",
      messageAr: `إنشاء قالب «تحديث مشروع» الجاهز`,
      messageEn: "Created the starter campaign-update email template",
      entityType: "EmailTemplate",
      entityId: template.id,
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    console.error("[update-campaigns/starter-template]", error);
    return NextResponse.json({ ok: false, error: "تعذّر إنشاء القالب." }, { status: 500 });
  }
}
