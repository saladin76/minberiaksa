import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { publishWhatsappTemplateToMeta } from "@/lib/communication/meta-template-publisher";
import { deriveOverallMetaTemplateStatus } from "@/lib/communication/whatsapp-template-status";

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

const createSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(1024),
  translations: z.record(translationSchema).nullable().optional(),
  metaCategory: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  header: headerSchema.optional(),
  footerText: z.string().max(60).nullable().optional(),
  buttons: z.array(buttonSchema).max(10).optional(),
  authentication: authSchema,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const rows = await prisma.whatsappTemplate.findMany({
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
          languageCode: true,
          locale: true,
          category: true,
        },
      },
    },
  });

  const templates = rows.map((row) => {
    const derived = deriveOverallMetaTemplateStatus(
      row.variants.length ? row.variants.map((variant) => variant.approvalStatus) : [row.approvalStatus],
    );
    const variants = row.variants.map((variant) => {
      const baseLocale = String(variant.locale ?? variant.languageCode ?? "").toLowerCase().replace(/[_-].*$/, "");
      const providerCategories = [...new Set(
        row.wabaVariants
          .filter((item) => String(item.locale ?? item.languageCode ?? "").toLowerCase().replace(/[_-].*$/, "") === baseLocale)
          .map((item) => String(item.category ?? "").toUpperCase())
          .filter(Boolean),
      )];
      if (!providerCategories.length && variant.category) providerCategories.push(String(variant.category).toUpperCase());
      return { ...variant, providerCategories };
    });
    return {
      ...row,
      variants,
      wabaVariants: undefined,
      providerApprovalStatus: derived.providerStatus,
      internalApprovalStatus: derived.internalStatus,
      approvalLabelAr: derived.labelAr,
      approvalReason: row.variants.map((variant) => variant.rejectionReason).find(Boolean) ?? row.lastSyncError ?? null,
      statusUpdatedAt: row.variants
        .map((variant) => variant.lastSyncedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? row.lastImportedAt ?? row.updatedAt,
    };
  });
  return NextResponse.json({
    templates,
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
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const actor = auditActorFromDashboardSession(session!);
  const created = await prisma.whatsappTemplate.create({
    data: {
      name: parsed.data.name,
      body: parsed.data.body,
      translations: parsed.data.translations
        ? (parsed.data.translations as Prisma.InputJsonValue)
        : undefined,
      category: parsed.data.metaCategory,
      purpose: parsed.data.metaCategory,
      kind: parsed.data.metaCategory === "MARKETING" ? "CAMPAIGN" : "SYSTEM",
      status: "READY",
      header: parsed.data.header ? (parsed.data.header as Prisma.InputJsonValue) : undefined,
      footerText: parsed.data.footerText ?? null,
      buttons: parsed.data.buttons ? (parsed.data.buttons as Prisma.InputJsonValue) : undefined,
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
