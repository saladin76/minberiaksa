import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { deleteOrArchiveWhatsappTemplate, rejectDisallowedTemplateEdit } from "@/lib/communication/whatsapp-template-guard";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(4096).optional(),
  translations: z
    .record(z.object({ body: z.string().optional() }))
    .nullable()
    .optional(),
});

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  const template = await prisma.whatsappTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

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
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  /* Meta owns the approval fields, and owns the body of anything it has approved. */
  const rejection = await rejectDisallowedTemplateEdit(id, parsed.data as Record<string, unknown>);
  if (rejection) return NextResponse.json({ error: rejection.error, fields: rejection.fields }, { status: rejection.status });

  const data: Prisma.WhatsappTemplateUpdateInput = {};
  if (parsed.data.name != null) data.name = parsed.data.name;
  if (parsed.data.body != null) data.body = parsed.data.body;
  if (parsed.data.translations !== undefined) {
    data.translations =
      parsed.data.translations === null
        ? (Prisma.DbNull as unknown as Prisma.InputJsonValue)
        : (parsed.data.translations as Prisma.InputJsonValue);
  }

  const updated = await prisma.whatsappTemplate.update({ where: { id }, data });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "WHATSAPP_TEMPLATE_UPDATE",
    messageAr: `حدّث قالب واتساب: ${updated.name}`,
    entityType: "WhatsappTemplate",
    entityId: updated.id,
    stream: "TEAM",
  });
  return NextResponse.json({ template: updated });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  /* A template a trigger, campaign or delivery still points at is archived, not destroyed: deleting
     it left the trigger resolving to nothing and firing silently forever. */
  const outcome = await deleteOrArchiveWhatsappTemplate(id);
  if (!outcome) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: outcome.action === "DELETED" ? "WHATSAPP_TEMPLATE_DELETE" : "WHATSAPP_TEMPLATE_ARCHIVE",
    messageAr: outcome.action === "DELETED"
      ? `حذف قالب واتساب: ${outcome.name}`
      : `أرشفة قالب واتساب مستخدَم: ${outcome.name} — ${outcome.references.total} مرجعًا`,
    entityType: "WhatsappTemplate",
    entityId: id,
    metadata: outcome.action === "ARCHIVED" ? { references: outcome.references } : undefined,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true, action: outcome.action, ...(outcome.action === "ARCHIVED" ? { references: outcome.references } : {}) });
}
