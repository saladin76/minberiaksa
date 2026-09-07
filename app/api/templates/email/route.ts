import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  document: z.record(z.unknown()),
  translations: z
    .record(z.object({ subject: z.string().optional(), document: z.record(z.unknown()).optional() }))
    .optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      subject: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const actor = auditActorFromDashboardSession(session!);
  const created = await prisma.emailTemplate.create({
    data: {
      name: parsed.data.name,
      subject: parsed.data.subject,
      document: parsed.data.document as Prisma.InputJsonValue,
      translations: parsed.data.translations
        ? (parsed.data.translations as Prisma.InputJsonValue)
        : undefined,
      createdById: actor.actorId,
    },
  });
  await writeAuditLog({
    ...actor,
    action: "EMAIL_TEMPLATE_CREATE",
    messageAr: `أنشأ قالب بريد: ${created.name}`,
    entityType: "EmailTemplate",
    entityId: created.id,
    stream: "TEAM",
  });

  return NextResponse.json({ template: created });
}
