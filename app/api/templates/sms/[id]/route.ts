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
  body: z.string().min(1).max(1600).optional(),
  translations: z.record(z.object({ body: z.string().optional() })).nullable().optional(),
  kind: z.enum(["SYSTEM", "CAMPAIGN"]).optional(),
  status: z.enum(["DRAFT", "READY", "NEEDS_REVIEW", "ARCHIVED"]).optional(),
  purpose: z.enum(["MARKETING", "UTILITY", "TRANSACTIONAL", "AUTHENTICATION"]).optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  const template = await prisma.smsTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const data: Prisma.SmsTemplateUpdateInput = {};
  if (parsed.data.name != null) data.name = parsed.data.name;
  if (parsed.data.body != null) data.body = parsed.data.body;
  if (parsed.data.kind != null) data.kind = parsed.data.kind;
  if (parsed.data.status != null) data.status = parsed.data.status;
  if (parsed.data.purpose != null) data.purpose = parsed.data.purpose;
  if (parsed.data.translations !== undefined) {
    // Explicit null means "drop every translation" — DbNull writes a real null rather than
    // leaving the previous object in place, which `undefined` would.
    data.translations =
      parsed.data.translations === null
        ? (Prisma.DbNull as unknown as Prisma.InputJsonValue)
        : (parsed.data.translations as Prisma.InputJsonValue);
  }

  const updated = await prisma.smsTemplate.update({ where: { id }, data });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "SMS_TEMPLATE_UPDATE",
    messageAr: `حدّث قالب رسالة نصية: ${updated.name}`,
    entityType: "SmsTemplate",
    entityId: updated.id,
    stream: "TEAM",
  });
  return NextResponse.json({ template: updated });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const { id } = await params;

  const deleted = await prisma.smsTemplate.delete({ where: { id } });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "SMS_TEMPLATE_DELETE",
    messageAr: `حذف قالب رسالة نصية: ${deleted.name}`,
    entityType: "SmsTemplate",
    entityId: deleted.id,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true });
}
