import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["ARCHIVE", "RESTORE"]) });

const ACTIVE_CAMPAIGN_STATUSES = ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "SENDING"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  }).catch(() => null);
  if (!template) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const actor = auditActorFromDashboardSession(session!);

  if (parsed.data.action === "ARCHIVE") {
    if (String(template.status ?? "").toUpperCase() === "ARCHIVED") {
      return NextResponse.json({ ok: true, status: "ARCHIVED" });
    }

    const [enabledTriggers, liveCampaigns] = await Promise.all([
      prisma.messageTrigger.count({ where: { templateId: id, enabled: true } }).catch(() => 0),
      prisma.communicationCampaign.count({
        where: { templateGroupId: id, status: { in: [...ACTIVE_CAMPAIGN_STATUSES] } },
      }).catch(() => 0),
    ]);

    if (enabledTriggers > 0 || liveCampaigns > 0) {
      return NextResponse.json({
        ok: false,
        error: "لا يمكن أرشفة القالب وهو مستخدم في محفّز تلقائي مفعّل أو حملة لم تنتهِ بعد.",
        blockers: { enabledTriggers, liveCampaigns },
      }, { status: 409 });
    }

    await prisma.whatsappTemplate.update({ where: { id }, data: { status: "ARCHIVED" } });
    await writeAuditLog({
      ...actor,
      action: "WHATSAPP_TEMPLATE_ARCHIVE",
      messageAr: `أرشف قالب واتساب: ${template.name}`,
      messageEn: `Archived WhatsApp template: ${template.name}`,
      entityType: "WhatsappTemplate",
      entityId: id,
      metadata: { explicitArchive: true },
      stream: "TEAM",
    });
    return NextResponse.json({ ok: true, status: "ARCHIVED" });
  }

  await prisma.whatsappTemplate.update({ where: { id }, data: { status: "READY" } });
  await writeAuditLog({
    ...actor,
    action: "WHATSAPP_TEMPLATE_RESTORE",
    messageAr: `استعاد قالب واتساب من الأرشيف: ${template.name}`,
    messageEn: `Restored WhatsApp template from archive: ${template.name}`,
    entityType: "WhatsappTemplate",
    entityId: id,
    metadata: { restoredTo: "READY" },
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true, status: "READY" });
}
