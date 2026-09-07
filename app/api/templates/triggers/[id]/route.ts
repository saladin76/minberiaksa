import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { MAX_COOLDOWN_DAYS, MAX_LAPSE_DAYS, MIN_COOLDOWN_DAYS, MIN_LAPSE_DAYS } from "@/lib/events/catalog";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  templateId: z.string().min(1).optional(),
  lapseDays: z.number().int().min(MIN_LAPSE_DAYS).max(MAX_LAPSE_DAYS).optional(),
  cooldownDays: z.number().int().min(MIN_COOLDOWN_DAYS).max(MAX_COOLDOWN_DAYS).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.messageTrigger.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.templateId) {
    const exists =
      existing.channel === "EMAIL"
        ? await prisma.emailTemplate.findUnique({ where: { id: parsed.data.templateId }, select: { id: true } })
        : await prisma.whatsappTemplate.findUnique({ where: { id: parsed.data.templateId }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: "Template not found for channel" }, { status: 400 });
    }
  }

  // Timing only applies to scheduled events; silently ignore it on event-driven triggers.
  const scheduled = existing.event === "DONATION_LAPSED";

  const updated = await prisma.messageTrigger.update({
    where: { id },
    data: {
      enabled: parsed.data.enabled,
      templateId: parsed.data.templateId,
      lapseDays: scheduled ? parsed.data.lapseDays : undefined,
      cooldownDays: scheduled ? parsed.data.cooldownDays : undefined,
    },
  });

  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "MESSAGE_TRIGGER_UPDATE",
    messageAr: `حدّث حدث تلقائي ${updated.event} — مفعّل: ${updated.enabled ? "نعم" : "لا"}`,
    entityType: "MessageTrigger",
    entityId: updated.id,
    stream: "TEAM",
  });
  return NextResponse.json({ trigger: updated });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  const deleted = await prisma.messageTrigger.delete({ where: { id } });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "MESSAGE_TRIGGER_DELETE",
    messageAr: `حذف حدث تلقائي ${deleted.event} (${deleted.channel})`,
    entityType: "MessageTrigger",
    entityId: deleted.id,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true });
}
