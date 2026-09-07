import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  evaluateReadiness,
  isCategoryKey,
  isPlatformKey,
  type PlatformKey,
} from "@/lib/marketing/platform-connection-requirements";
import {
  normalizeCountryList,
  normalizeLocaleList,
} from "@/lib/marketing/locales-countries";
import {
  applySecretField,
  SECRET_FIELDS,
  redactSecretsFromMetadata,
} from "@/lib/marketing/secrets";
import { serializeConnection } from "@/lib/marketing/connection-serializer";

const createSchema = z.object({
  category: z.string(),
  platform: z.string(),
  name: z.string().min(1).max(160),
  accountId: z.string().max(160).optional().nullable(),
  accountName: z.string().max(160).optional().nullable(),
  businessId: z.string().max(160).optional().nullable(),
  managerAccountId: z.string().max(160).optional().nullable(),
  pixelId: z.string().max(160).optional().nullable(),
  datasetId: z.string().max(160).optional().nullable(),
  conversionId: z.string().max(160).optional().nullable(),
  conversionLabel: z.string().max(160).optional().nullable(),
  advertiserId: z.string().max(160).optional().nullable(),
  appId: z.string().max(160).optional().nullable(),
  propertyId: z.string().max(160).optional().nullable(),
  streamId: z.string().max(160).optional().nullable(),
  messagingServiceSid: z.string().max(160).optional().nullable(),
  senderId: z.string().max(160).optional().nullable(),
  whatsappSender: z.string().max(160).optional().nullable(),
  smsSender: z.string().max(160).optional().nullable(),
  emailSender: z.string().max(160).optional().nullable(),
  defaultForPlatform: z.boolean().optional(),
  supportedLocales: z.array(z.string()).optional(),
  supportedCountries: z.array(z.string()).optional(),
  defaultCurrency: z.string().max(8).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  authToken: z.string().optional(),
  appSecret: z.string().optional(),
  clientSecret: z.string().optional(),
  developerToken: z.string().optional(),
  apiSecret: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const platform = sp.get("platform");
  const category = sp.get("category");
  const enabled = sp.get("enabled");
  const status = sp.get("status");
  const locale = sp.get("locale");
  const country = sp.get("country");

  const where: Prisma.MarketingPlatformConnectionWhereInput = {};
  if (platform) where.platform = platform;
  if (category) where.category = category;
  if (status) where.status = status;
  if (enabled === "true") where.enabled = true;
  else if (enabled === "false") where.enabled = false;
  if (locale) where.supportedLocales = { has: locale };
  if (country) where.supportedCountries = { has: country };

  const rows = await prisma.marketingPlatformConnection.findMany({
    where,
    orderBy: [
      { defaultForPlatform: "desc" },
      { category: "asc" },
      { platform: "asc" },
      { name: "asc" },
    ],
  });
  const connections = rows.map(serializeConnection);

  const summary = {
    total: connections.length,
    complete: connections.filter((c) => c.readiness.completionPercent >= 100 && c.status !== "DISABLED").length,
    incomplete: connections.filter((c) => c.status === "MISSING_CONFIG").length,
    errored: connections.filter((c) => ["AUTH_ERROR", "PERMISSION_ERROR", "SYNC_ERROR"].includes(c.status)).length,
    disabled: connections.filter((c) => !c.enabled).length,
    lastSyncAt: connections.reduce<string | null>((acc, c) => {
      if (!c.lastSyncAt) return acc;
      if (!acc || c.lastSyncAt > acc) return c.lastSyncAt;
      return acc;
    }, null),
  };

  return NextResponse.json({ connections, summary });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (!isPlatformKey(d.platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  if (!isCategoryKey(d.category)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });

  const platform = d.platform as PlatformKey;
  const data: Record<string, unknown> = {
    category: d.category,
    platform,
    name: d.name,
    accountId: d.accountId ?? null,
    accountName: d.accountName ?? null,
    businessId: d.businessId ?? null,
    managerAccountId: d.managerAccountId ?? null,
    pixelId: d.pixelId ?? null,
    datasetId: d.datasetId ?? null,
    conversionId: d.conversionId ?? null,
    conversionLabel: d.conversionLabel ?? null,
    advertiserId: d.advertiserId ?? null,
    appId: d.appId ?? null,
    propertyId: d.propertyId ?? null,
    streamId: d.streamId ?? null,
    messagingServiceSid: d.messagingServiceSid ?? null,
    senderId: d.senderId ?? null,
    whatsappSender: d.whatsappSender ?? null,
    smsSender: d.smsSender ?? null,
    emailSender: d.emailSender ?? null,
    enabled: d.enabled ?? true,
    defaultForPlatform: d.defaultForPlatform ?? false,
    supportedLocales: normalizeLocaleList(d.supportedLocales ?? []),
    supportedCountries: normalizeCountryList(d.supportedCountries ?? []),
    defaultCurrency: d.defaultCurrency ?? null,
    notes: d.notes ?? null,
  };
  for (const f of SECRET_FIELDS) {
    applySecretField(data, f, (d as Record<string, unknown>)[f]);
  }

  const readiness = evaluateReadiness(platform, data, { enabled: data.enabled as boolean });
  data.status = readiness.status;
  data.configChecklist = readiness as unknown as Prisma.InputJsonValue;
  const actor = auditActorFromDashboardSession(session!);
  data.updatedBy = actor.actorId;

  const created = await prisma.$transaction(async (tx) => {
    if (data.defaultForPlatform === true) {
      await tx.marketingPlatformConnection.updateMany({
        where: { platform },
        data: { defaultForPlatform: false },
      });
    }
    return tx.marketingPlatformConnection.create({
      data: data as Prisma.MarketingPlatformConnectionUncheckedCreateInput,
    });
  });

  await writeAuditLog({
    ...actor,
    action: "MARKETING_PLATFORM_CONNECTION_CREATED",
    messageAr: `أنشأ اتصال منصة: ${created.name} (${created.platform})`,
    entityType: "MarketingPlatformConnection",
    entityId: created.id,
    metadata: redactSecretsFromMetadata({
      connectionId: created.id,
      platform: created.platform,
      category: created.category,
      status: created.status,
      defaultForPlatform: created.defaultForPlatform,
      completionPercent: readiness.completionPercent,
      missingRequiredFields: readiness.missingRequiredFields,
    }),
    stream: "TEAM",
  });

  return NextResponse.json({
    ok: true,
    status: readiness.status,
    message: readiness.nextStepMessage,
    completionPercent: readiness.completionPercent,
    missingRequiredFields: readiness.missingRequiredFields,
    missingOptionalFields: readiness.missingOptionalFields,
    guidance: readiness.guidance,
    connection: serializeConnection(created),
  });
}
