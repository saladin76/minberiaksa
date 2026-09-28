import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { syncMetaWhatsappTemplates } from "@/lib/communication/whatsapp-template-sync";

/**
 * Pull the template catalogue from Meta.
 *
 * This is what makes every readiness answer in the platform true: the dashboard, the campaign
 * builder, the trigger preflight and the runtime all read `WhatsappTemplateVariant`, and this is its
 * only writer. It is an explicit operator action rather than a background job because it calls an
 * external API on the organisation's account, and because a failed sync must be visible to the person
 * who is waiting on it — `unmatchedNames` in particular, which lists templates Meta has that no local
 * template claims.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const summary = await syncMetaWhatsappTemplates({ actor: auditActorFromDashboardSession(session!) });
  if (!summary.ok) {
    return NextResponse.json({ ok: false, error: summary.reason, detail: summary.detail, summary }, { status: 502 });
  }
  return NextResponse.json({ ok: true, summary });
}
