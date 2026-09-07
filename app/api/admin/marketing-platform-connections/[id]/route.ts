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

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
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
  clear_accessToken: z.boolean().optional(),
  clear_refreshToken: z.boolean().optional(),
  clear_authToken: z.boolean().optional(),
  clear_appSecret: z.boolean().optional(),
  clear_clientSecret: z.boolean().optional(),
  clear_developerToken: z.boolean().optional(),
  clear_apiSecret: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.marketingPlatformConnection.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isPlatformKey(existing.platform)) return NextResponse.json({ error: "Stored platform unknown" }, { status: 500 });
  const platform = existing.platform as PlatformKey;

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  const PLAIN_FIELDS = [
    "name", "accountId", "accountName", "businessId", "managerAccountId",
    "pixelId", "datasetId", "conversionId", "conversionLabel", "advertiserId",
    "appId", "propertyId", "streamId", "messagingServiceSid", "senderId",
    "whatsappSender", "smsSender", "emailSender", "defaultForPlatform",
    "defaultCurrency", "notes", "enabled",
  ] as const;
  const changedFields: string[] = [];
  for (const f of PLAIN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(d, f)) {
      update[f] = (d as Record<string, unknown>)[f];
      changedFields.push(f);
    }
  }
  if (d.supportedLocales !== undefined) { update.supportedLocales = normalizeLocaleList(d.supportedLocales); changedFields.push("supportedLocales"); }
  if (d.supportedCountries !== undefined) { update.supportedCountries = normalizeCountryList(d.supportedCountries); changedFields.push("supportedCountries"); }

  for (const f of SECRET_FIELDS) {
    const incoming = (d as Record<string, unknown>)[f];
    const clear = (d as Record<string, unknown>)[`clear_${f}`] === true;
    const before = update[f];
    applySecretField(update, f, incoming, { clear });
    if (update[f] !== before) changedFields.push(f);
  }

  const merged = { ...existing, ...update } as Record<string, unknown>;
  const readiness = evaluateReadiness(platform, merged, {
    enabled: (update.enabled ?? existing.enabled) as boolean,
    existingStatus: existing.status as never,
  });
  update.status = readiness.status;
  update.configChecklist = readiness as unknown as Prisma.InputJsonValue;
  const actor = auditActorFromDashboardSession(session!);
  update.updatedBy = actor.actorId;

  const updated = await prisma.$transaction(async (tx) => {
    if (update.defaultForPlatform === true) {
      await tx.marketingPlatformConnection.updateMany({
        where: { platform, id: { not: id } },
        data: { defaultForPlatform: false },
      });
    }
    return tx.marketingPlatformConnection.update({
      where: { id },
      data: update as Prisma.MarketingPlatformConnectionUncheckedUpdateInput,
    });
  });

  await writeAuditLog({
    ...actor,
    action: "MARKETING_PLATFORM_CONNECTION_UPDATED",
    messageAr: `حدّث اتصال منصة: ${updated.name} (${updated.platform})`,
    entityType: "MarketingPlatformConnection",
    entityId: updated.id,
    metadata: redactSecretsFromMetadata({
      connectionId: updated.id,
      platform: updated.platform,
      category: updated.category,
      status: updated.status,
      defaultForPlatform: updated.defaultForPlatform,
      changedFields,
      completionPercent: readiness.completionPercent,
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
    connection: serializeConnection(updated),
  });
}
