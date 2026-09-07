import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

/**
 * SMS templates — plain text, per-locale, billed by the segment.
 *
 * The 1600-character ceiling is deliberate rather than arbitrary: it is roughly ten UCS-2 segments,
 * far past anything worth sending, and exists only to stop a paste accident becoming a very
 * expensive send. Segment arithmetic itself is presentational and lives client-side, because it has
 * to update as the operator types.
 */

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(1600),
  translations: z.record(z.object({ body: z.string().optional() })).nullable().optional(),
  kind: z.enum(["SYSTEM", "CAMPAIGN"]).optional(),
  status: z.enum(["DRAFT", "READY", "NEEDS_REVIEW", "ARCHIVED"]).optional(),
  purpose: z.enum(["MARKETING", "UTILITY", "TRANSACTIONAL", "AUTHENTICATION"]).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const templates = await prisma.smsTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, body: true, translations: true,
      kind: true, status: true, purpose: true,
      createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const created = await prisma.smsTemplate.create({
    data: {
      name: parsed.data.name,
      body: parsed.data.body,
      translations: parsed.data.translations
        ? (parsed.data.translations as Prisma.InputJsonValue)
        : undefined,
      kind: parsed.data.kind,
      status: parsed.data.status,
      purpose: parsed.data.purpose,
      createdById: actor.actorId,
    },
  });

  await writeAuditLog({
    ...actor,
    action: "SMS_TEMPLATE_CREATE",
    messageAr: `أنشأ قالب رسالة نصية: ${created.name}`,
    entityType: "SmsTemplate",
    entityId: created.id,
    stream: "TEAM",
  });
  return NextResponse.json({ template: created });
}
