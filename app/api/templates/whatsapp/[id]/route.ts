import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { deleteOrArchiveWhatsappTemplate, rejectDisallowedTemplateEdit } from "@/lib/communication/whatsapp-template-guard";
import { publishWhatsappTemplateToMeta } from "@/lib/communication/meta-template-publisher";

const headerSchema = z.object({
  type: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).default("NONE"),
  text: z.string().max(60).nullable().optional(),
  exampleHandle: z.string().max(4096).nullable().optional(),
  mediaUrl: z.string().max(4096).nullable().optional(),
  mediaPublicId: z.string().max(512).nullable().optional(),
  previewUrl: z.string().max(4096).nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  mimeType: z.string().max(120).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  address: z.string().max(256).nullable().optional(),
});

const buttonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  text: z.string().min(1).max(25),
  url: z.string().max(2048).nullable().optional(),
  phoneNumber: z.string().max(32).nullable().optional(),
  example: z.string().max(512).nullable().optional(),
});

const authSchema = z.object({
  addSecurityRecommendation: z.boolean().default(true),
  codeExpirationMinutes: z.number().int().min(1).max(90).default(10),
  otpType: z.enum(["COPY_CODE", "ONE_TAP"]).default("COPY_CODE"),
  buttonText: z.string().min(1).max(25).default("Copy Code"),
  autofillText: z.string().max(25).nullable().optional(),
  packageName: z.string().max(255).nullable().optional(),
  signatureHash: z.string().max(255).nullable().optional(),
}).nullable().optional();

const translationSchema = z.object({
  body: z.string().max(1024).optional(),
  headerText: z.string().max(60).nullable().optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(1024).optional(),
  translations: z.record(translationSchema).nullable().optional(),
  metaCategory: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  header: headerSchema.optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
  authentication: authSchema,
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
  const { metaCategory, ...editable } = parsed.data;
  const rejection = await rejectDisallowedTemplateEdit(id, editable as Record<string, unknown>);
  if (rejection) return NextResponse.json({ error: rejection.error, fields: rejection.fields }, { status: rejection.status });

  const data: Prisma.WhatsappTemplateUpdateInput = {};
  if (metaCategory) {
    data.category = metaCategory;
    data.purpose = metaCategory;
    data.kind = metaCategory === "MARKETING" ? "CAMPAIGN" : "SYSTEM";
  }
  if (editable.name != null) data.name = editable.name;
  if (editable.body != null) data.body = editable.body;
  if (editable.translations !== undefined) {
    data.translations =
      editable.translations === null
        ? (null as unknown as Prisma.InputJsonValue)
        : (editable.translations as Prisma.InputJsonValue);
  }
  if (editable.header !== undefined) data.header = editable.header as Prisma.InputJsonValue;
  if (editable.footerText !== undefined) data.footerText = editable.footerText;
  if (editable.buttons !== undefined) data.buttons = editable.buttons as Prisma.InputJsonValue;
  if (editable.authentication !== undefined) {
    data.authentication = editable.authentication === null
      ? (null as unknown as Prisma.InputJsonValue)
      : (editable.authentication as Prisma.InputJsonValue);
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
  const publish = await publishWhatsappTemplateToMeta(updated.id, actor, metaCategory ? { category: metaCategory } : {});
  if (!publish.ok) {
    return NextResponse.json(
      {
        error: "تم حفظ التعديلات محليًا لكن لم يكتمل إنشاء/ربط القالب في Meta.",
        saved: true,
        template: updated,
        publish,
      },
      { status: 502 },
    );
  }
  const fresh = await prisma.whatsappTemplate.findUnique({ where: { id: updated.id } });
  return NextResponse.json({ template: fresh ?? updated, publish });
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
      : `أرشفة قالب واتساب مستخدَم: ${outcome.name}  ${outcome.references.total} مرجعًا`,
    entityType: "WhatsappTemplate",
    entityId: id,
    metadata: outcome.action === "ARCHIVED" ? { references: outcome.references } : undefined,
    stream: "TEAM",
  });
  return NextResponse.json({ ok: true, action: outcome.action, ...(outcome.action === "ARCHIVED" ? { references: outcome.references } : {}) });
}
