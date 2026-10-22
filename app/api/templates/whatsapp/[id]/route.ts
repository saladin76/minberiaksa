import { classifyEventTemplates } from "@/lib/communication/template-event-classification";
import { headerSchema, templateButtonsSchema, authSchema, translationSchema } from "@/lib/communication/whatsapp-template-schema";
import { unsubmittedTemplateLocales } from "@/lib/communication/template-locale-media";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { deleteOrArchiveWhatsappTemplate, rejectDisallowedTemplateEdit, submittedMetaLocales } from "@/lib/communication/whatsapp-template-guard";
import { publishWhatsappTemplateToMeta } from "@/lib/communication/meta-template-publisher";
import { hasWhatsappUnsubscribeQuickReply } from "@/lib/communication/whatsapp-template-unsubscribe";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(1024).optional(),
  translations: z.record(translationSchema).nullable().optional(),
  metaCategory: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  header: headerSchema.optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: templateButtonsSchema.optional(),
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

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id },
    include: {
      variants: {
        where: { provider: "META_WHATSAPP" },
        select: { languageCode: true, locale: true, category: true },
      },
      wabaVariants: {
        where: { provider: "META_WHATSAPP" },
        select: { languageCode: true, locale: true, category: true },
      },
    },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const submittedLocales = Array.from(await submittedMetaLocales(id)).sort();
  const providerCategoriesByLocale: Record<string, string[]> = {};
  for (const variant of [...template.variants, ...template.wabaVariants]) {
    const locale = String(variant.locale ?? variant.languageCode ?? "").toLowerCase().replace(/[_-].*$/, "");
    const category = String(variant.category ?? "").toUpperCase();
    if (!locale || !category) continue;
    providerCategoriesByLocale[locale] = [...new Set([...(providerCategoriesByLocale[locale] ?? []), category])];
  }
  const templateData = { ...template, variants: undefined, wabaVariants: undefined };
  return NextResponse.json({
    template: { ...(await classifyEventTemplates("WHATSAPP", [templateData]))[0], submittedLocales, providerCategoriesByLocale },
  });
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
      { error: parsed.error.issues.map(issue=>issue.message).join(" · "), issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  /* Meta owns the approval fields, and owns the body of anything it has approved. */
  const { metaCategory, ...editable } = parsed.data;
  const submittedBefore = await submittedMetaLocales(id);
  const rejection = await rejectDisallowedTemplateEdit(id, editable as Record<string, unknown>);
  if (rejection) return NextResponse.json({ error: rejection.error, fields: rejection.fields }, { status: rejection.status });

  // Languages are separate Meta variants under the same provider template name. For an existing
  // template, publish only newly-added locales; do not resubmit already-approved/in-review variants.
  const currentTemplate = await prisma.whatsappTemplate.findUnique({
    where: { id },
    select: { translations: true, category: true, kind: true, purpose: true, buttons: true },
  });
  const newlyAddedLocales = unsubmittedTemplateLocales(
    editable.translations === undefined ? currentTemplate?.translations : editable.translations,
    submittedBefore,
  );
  const nextCategory = metaCategory ?? currentTemplate?.category;
  if (nextCategory === "MARKETING") {
    const rootButtons = editable.buttons ?? currentTemplate?.buttons;
    if (!submittedBefore.has("ar") && !hasWhatsappUnsubscribeQuickReply(rootButtons)) {
      return NextResponse.json({
        error: "القالب التسويقي يحتاج زرًا واضحًا لإيقاف الرسائل.",
        code: "WHATSAPP_MARKETING_UNSUBSCRIBE_REQUIRED",
        locale: "ar",
      }, { status: 400 });
    }
    const translations = editable.translations === undefined
      ? (currentTemplate?.translations as Record<string, { buttons?: unknown }> | null)
      : editable.translations;
    for (const locale of newlyAddedLocales) {
      const translation = translations && typeof translations === "object" ? translations[locale] : undefined;
      if (!hasWhatsappUnsubscribeQuickReply(translation?.buttons)) {
        return NextResponse.json({
          error: `القالب التسويقي يحتاج زرًا واضحًا لإيقاف الرسائل في نسخة اللغة ${locale}.`,
          code: "WHATSAPP_MARKETING_UNSUBSCRIBE_REQUIRED",
          locale,
        }, { status: 400 });
      }
    }
  }

  const data: Prisma.WhatsappTemplateUpdateInput = {};
  if (metaCategory && metaCategory !== currentTemplate?.category) {
    data.category = metaCategory;
    data.purpose = metaCategory;
    const linked = await prisma.messageTrigger.count({ where: { channel: "WHATSAPP", templateId: id } }) > 0;
    const nextKind = linked || metaCategory !== "MARKETING" ? "SYSTEM" : "CAMPAIGN";
    if (nextKind === "SYSTEM" && await prisma.communicationCampaign.count({ where: { channel: "WHATSAPP", templateGroupId: id } }) > 0) {
      return NextResponse.json({ error: "TEMPLATE_IN_USE" }, { status: 409 });
    }
    data.kind = nextKind;
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

  let updated;
  try {
    updated = await prisma.whatsappTemplate.update({ where: { id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "WHATSAPP_TEMPLATE_UPDATE",
    messageAr: `حدّث قالب واتساب: ${updated.name}`,
    entityType: "WhatsappTemplate",
    entityId: updated.id,
    stream: "TEAM",
  });
  const publish = newlyAddedLocales.length
    ? await publishWhatsappTemplateToMeta(updated.id, actor, {
        ...(metaCategory ? { category: metaCategory } : {}),
        locales: newlyAddedLocales,
      })
    : {
        ok: true,
        templateId: updated.id,
        targets: 0,
        created: 0,
        existing: 0,
        failed: 0,
        unsupportedWabas: [],
        statuses: [],
        errors: [],
        canonicalWabaId: null,
      };
  if (!publish.ok) {
    return NextResponse.json(
      {
        error: "تم حفظ التعديلات محليًا لكن لم يكتمل إنشاء/ربط اللغة الجديدة في Meta.",
        saved: true,
        template: updated,
        publish,
      },
      { status: 502 },
    );
  }
  const fresh = await prisma.whatsappTemplate.findUnique({ where: { id: updated.id } });
  const submittedLocales = Array.from(await submittedMetaLocales(updated.id)).sort();
  return NextResponse.json({
    template: { ...(await classifyEventTemplates("WHATSAPP", [fresh ?? updated]))[0], submittedLocales },
    publish,
  });
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
