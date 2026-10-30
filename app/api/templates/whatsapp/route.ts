import { localizeDonationFailureDraft } from "@/lib/templates/localize-donation-failure-link";
import { classifyEventTemplates } from "@/lib/communication/template-event-classification";
import { headerSchema, templateButtonsSchema, authSchema, translationSchema } from "@/lib/communication/whatsapp-template-schema";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { publishWhatsappTemplateToMeta } from "@/lib/communication/meta-template-publisher";
import { defaultTemplateStatus } from "@/lib/communication/default-template-status";
import { hasWhatsappUnsubscribeQuickReply } from "@/lib/communication/whatsapp-template-unsubscribe";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["SYSTEM", "CAMPAIGN"]).optional(),
  body: z.string().min(1).max(1024),
  translations: z.record(translationSchema).nullable().optional(),
  metaCategory: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  header: headerSchema.optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: templateButtonsSchema.optional(),
  authentication: authSchema,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const defaults = await prisma.communicationSender.findMany({
    where: { channel: "WHATSAPP", provider: "META_WHATSAPP", enabled: true, status: "ACTIVE", isDefault: true, businessAccountId: { not: null } },
    select: { businessAccountId: true }, take: 2,
  });
  const defaultWaba = defaults.length === 1 ? defaults[0].businessAccountId : null;
  const rows = await prisma.whatsappTemplate.findMany({
    where: { OR: [{ provider: null }, { provider: { isSet: false } }, { provider: { in: ["META_WHATSAPP", "MANUAL"] } }] },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      provider: true,
      channel: true,
      externalTemplateId: true,
      templateType: true,
      language: true,
      category: true,
      kind: true,
      purpose: true,
      status: true,
      approvalStatus: true,
      header: true,
      footerText: true,
      buttons: true,
      variables: true,
      lastImportedAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      variants: {
        where: { provider: "META_WHATSAPP" },
        select: {
          languageCode: true,
          locale: true,
          approvalStatus: true,
          category: true,
          rejectionReason: true,
          qualityRating: true,
          lastSyncedAt: true,
        },
      },
      wabaVariants: {
        where: { provider: "META_WHATSAPP" },
        select: {
          businessAccountId: true, languageCode: true, locale: true,
          approvalStatus: true, category: true, rejectionReason: true,
          qualityRating: true, lastSyncedAt: true,
        },
      },
    },
  });

  const templates = rows.map((row) => {
    const scoped = defaultTemplateStatus(defaultWaba, row.wabaVariants, row.variants);
    const derived = scoped.overall;
    const variants = scoped.variants;
    return {
      ...row,
      approvalStatus: derived.providerStatus,
      variants,
      wabaVariants: undefined,
      providerApprovalStatus: !row.variants.length && row.lastSyncStatus === "failed" ? "NOT_SUBMITTED" : derived.providerStatus,
      internalApprovalStatus: derived.internalStatus,
      approvalLabelAr: !variants.length && row.lastSyncStatus === "failed" ? "محفوظ محليًا · لم يصل إلى Meta" : scoped.labelAr,
      approvalReason: variants.map((variant) => variant.rejectionReason).find(Boolean) ?? (!variants.length && row.lastSyncStatus === "failed" ? row.lastSyncError : null),
      statusUpdatedAt: variants
        .map((variant) => variant.lastSyncedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? row.lastImportedAt ?? row.updatedAt,
    };
  });
  return NextResponse.json({
    templates: await classifyEventTemplates("WHATSAPP", templates),
    approvalScope: "DEFAULT_ACCOUNT",
    defaultAccountConfigured: Boolean(defaultWaba),
    directSendEnabled: process.env.META_WHATSAPP_DIRECT_SEND_ENABLED === "true",
  });
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
      { error: parsed.error.issues.map(issue=>issue.message).join(" · "), issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (parsed.data.metaCategory === "MARKETING") {
    const missingLocale = [
      ["ar", parsed.data.buttons],
      ...Object.entries(parsed.data.translations ?? {}).map(([locale, value]) => [locale, value.buttons] as const),
    ].find(([, buttons]) => !hasWhatsappUnsubscribeQuickReply(buttons));
    if (missingLocale) {
      return NextResponse.json({
        error: `كل نسخة لغة في قالب واتساب التسويقي تحتاج زرًا واضحًا لإيقاف الرسائل (اللغة: ${missingLocale[0]}).`,
        code: "WHATSAPP_MARKETING_UNSUBSCRIBE_REQUIRED",
      }, { status: 400 });
    }
  }

  const actor = auditActorFromDashboardSession(session!);
  const created = await prisma.whatsappTemplate.create({
    data: {
      name: parsed.data.name,
      body: localizeDonationFailureDraft({ body: parsed.data.body }, "ar").body,
      translations: parsed.data.translations
        ? (Object.fromEntries(Object.entries(parsed.data.translations).map(([locale, draft]) => [locale, localizeDonationFailureDraft({ ...draft, body: draft.body ?? "" }, locale)])) as Prisma.InputJsonValue)
        : undefined,
      category: parsed.data.metaCategory,
      purpose: parsed.data.metaCategory,
      kind: parsed.data.kind ?? (parsed.data.metaCategory === "MARKETING" ? "CAMPAIGN" : "SYSTEM"),
      status: "READY",
      header: parsed.data.header ? (parsed.data.header as Prisma.InputJsonValue) : undefined,
      footerText: parsed.data.footerText ?? null,
      buttons: parsed.data.buttons ? (localizeDonationFailureDraft({ body: parsed.data.body, buttons: parsed.data.buttons }, "ar").buttons as Prisma.InputJsonValue) : undefined,
      authentication: parsed.data.authentication ? (parsed.data.authentication as Prisma.InputJsonValue) : undefined,
      provider: "MANUAL",
      channel: "WHATSAPP",
      createdById: actor.actorId,
    },
  });
  await writeAuditLog({
    ...actor,
    action: "WHATSAPP_TEMPLATE_CREATE",
    messageAr: `أنشأ قالب واتساب: ${created.name}`,
    entityType: "WhatsappTemplate",
    entityId: created.id,
    stream: "TEAM",
  });
  const publish = await publishWhatsappTemplateToMeta(created.id, actor, { category: parsed.data.metaCategory });
  if (!publish.ok) {
    return NextResponse.json(
      {
        error: "تم حفظ القالب محليًا لكن لم يكتمل إنشاؤه في Meta.",
        saved: true,
        template: created,
        publish,
      },
      { status: 502 },
    );
  }
  const fresh = await prisma.whatsappTemplate.findUnique({ where: { id: created.id } });
  return NextResponse.json({ template: fresh ?? created, publish }, { status: 201 });
}
