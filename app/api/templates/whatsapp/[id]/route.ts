import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

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

  const deleted = await prisma.whatsappTemplate.delete({ where: { id } });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "WHATSAPP_TEMPLATE_DELETE",
    messageAr: `حذف قالب واتساب: ${deleted.name}`,
    entityType: "WhatsappTemplate",
    entityId: deleted.id,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true });
}
