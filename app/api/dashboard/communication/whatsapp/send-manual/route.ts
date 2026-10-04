import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { sendManualWhatsappTemplate } from "@/lib/communication/manual-whatsapp-service";

const schema = z.object({
  userId: z.string().min(1),
  templateId: z.string().min(1),
  locale: z.string().min(2).max(8).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const result = await sendManualWhatsappTemplate({
    userId: parsed.data.userId,
    templateId: parsed.data.templateId,
    localeOverride: parsed.data.locale ?? null,
    actor,
  });

  if (!result.ok) {
    await writeAuditLog({
      ...actor,
      action: "communication.whatsapp.manual.failed",
      messageAr: "تعذّر إرسال رسالة واتساب يدوية إلى متبرع",
      messageEn: "Manual WhatsApp donor send failed",
      entityType: "User",
      entityId: parsed.data.userId,
      metadata: {
        templateId: parsed.data.templateId,
        reason: result.reason,
        detail: result.detail ?? null,
        externalCall: result.status >= 500,
      },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: result.reason, detail: result.detail ?? null },
      { status: result.status },
    );
  }

  await writeAuditLog({
    ...actor,
    action: "communication.whatsapp.manual.sent",
    messageAr: "تم إرسال رسالة واتساب يدوية إلى متبرع",
    messageEn: "Manual WhatsApp donor message sent",
    entityType: "CommunicationDelivery",
    entityId: result.deliveryId,
    metadata: {
      userId: parsed.data.userId,
      templateId: parsed.data.templateId,
      senderId: result.senderId,
      senderPhone: result.senderPhone,
      locale: result.locale,
      externalCall: true,
    },
    stream: "TEAM",
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...result });
}
