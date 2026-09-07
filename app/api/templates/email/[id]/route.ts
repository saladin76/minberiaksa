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
  subject: z.string().min(1).max(200).optional(),
  document: z.record(z.unknown()).optional(),
  translations: z
    .record(z.object({ subject: z.string().optional(), document: z.record(z.unknown()).optional() }))
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

  const template = await prisma.emailTemplate.findUnique({ where: { id } });
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

  const data: Prisma.EmailTemplateUpdateInput = {};
  if (parsed.data.name != null) data.name = parsed.data.name;
  if (parsed.data.subject != null) data.subject = parsed.data.subject;
  if (parsed.data.document != null) {
    data.document = parsed.data.document as Prisma.InputJsonValue;
  }
  if (parsed.data.translations !== undefined) {
    data.translations =
      parsed.data.translations === null
        ? (Prisma.DbNull as unknown as Prisma.InputJsonValue)
        : (parsed.data.translations as Prisma.InputJsonValue);
  }

  const updated = await prisma.emailTemplate.update({ where: { id }, data });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "EMAIL_TEMPLATE_UPDATE",
    messageAr: `حدّث قالب بريد: ${updated.name}`,
    entityType: "EmailTemplate",
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

  const deleted = await prisma.emailTemplate.delete({ where: { id } });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "EMAIL_TEMPLATE_DELETE",
    messageAr: `حذف قالب بريد: ${deleted.name}`,
    entityType: "EmailTemplate",
    entityId: deleted.id,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true });
}
