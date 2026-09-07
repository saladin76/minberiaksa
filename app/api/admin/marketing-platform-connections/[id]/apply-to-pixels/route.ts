import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { redactSecretsFromMetadata } from "@/lib/marketing/secrets";

const TRACKING_COLLECTION = "TrackingSettings";

type MongoRaw = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMongoId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.$oid === "string") return value.$oid;
  return null;
}

async function getRawTrackingSettings(): Promise<MongoRaw | null> {
  const result = await prisma.$runCommandRaw({
    find: TRACKING_COLLECTION,
    limit: 1,
    sort: { createdAt: 1 },
  });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch
    : [];
  return (batch[0] as MongoRaw | undefined) ?? null;
}

async function persistTrackingPatch($set: Record<string, unknown>) {
  const existing = await getRawTrackingSettings();
  const now = new Date();
  const id = normalizeMongoId(existing?._id) ?? normalizeMongoId(existing?.id);

  if (id) {
    await prisma.$runCommandRaw({
      update: TRACKING_COLLECTION,
      updates: [
        {
          q: { _id: { $oid: id } },
          u: { $set: { ...$set, updatedAt: now } },
          upsert: false,
        },
      ],
    });
    return id;
  }

  await prisma.$runCommandRaw({
    insert: TRACKING_COLLECTION,
    documents: [{ ...$set, createdAt: now, updatedAt: now }],
  });
  const saved = await getRawTrackingSettings();
  return normalizeMongoId(saved?._id) ?? undefined;
}

function putIfValue(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) target[key] = value.trim();
  else if (typeof value === "boolean") target[key] = value;
}

function mapConnectionToTracking(row: {
  platform: string;
  accountId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  apiSecret: string | null;
  propertyId: string | null;
  streamId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  advertiserId: string | null;
}): { fields: Record<string, unknown>; unsupported: boolean; platformLabel: string } {
  const fields: Record<string, unknown> = {};

  switch (row.platform) {
    case "META":
      putIfValue(fields, "facebookPixelId", row.pixelId);
      putIfValue(fields, "metaDatasetId", row.datasetId);
      putIfValue(fields, "facebookAccessToken", row.accessToken);
      putIfValue(fields, "facebookTestEventCode", row.appSecret);
      fields.metaDonateEventName = "Donate";
      return { fields, unsupported: false, platformLabel: "Meta" };

    case "GA4":
      putIfValue(fields, "gaMeasurementId", row.accountId);
      putIfValue(fields, "gaApiSecret", row.apiSecret);
      putIfValue(fields, "gaPropertyId", row.propertyId);
      putIfValue(fields, "gaStreamId", row.streamId);
      return { fields, unsupported: false, platformLabel: "GA4" };

    case "GOOGLE_ADS":
      putIfValue(fields, "googleAdsConversionId", row.conversionId);
      putIfValue(fields, "googleAdsConversionLabel", row.conversionLabel);
      putIfValue(fields, "googleAdsCustomerId", row.accountId);
      if (row.conversionId || row.conversionLabel) fields.googleAdsEnhancedConversionsEnabled = true;
      return { fields, unsupported: false, platformLabel: "Google Ads" };

    case "TIKTOK":
      putIfValue(fields, "tiktokPixelId", row.pixelId);
      putIfValue(fields, "tiktokAccessToken", row.accessToken);
      putIfValue(fields, "tiktokAdvertiserId", row.advertiserId);
      putIfValue(fields, "tiktokTestEventCode", row.appSecret);
      if (row.accessToken) fields.tiktokEventsApiEnabled = true;
      return { fields, unsupported: false, platformLabel: "TikTok" };

    case "X":
      putIfValue(fields, "xPixelId", row.pixelId);
      putIfValue(fields, "xConversionEventId", row.conversionId);
      putIfValue(fields, "xAccessToken", row.accessToken);
      putIfValue(fields, "xAdAccountId", row.accountId);
      if (row.accessToken) fields.xConversionsApiEnabled = true;
      return { fields, unsupported: false, platformLabel: "X" };

    default:
      return { fields, unsupported: true, platformLabel: row.platform };
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const deniedForConnections = requireAdminOrDashboardPermission(session, "platformConnections");
  if (deniedForConnections) return deniedForConnections;
  const deniedForPixels = requireAdminOrDashboardPermission(session, "pixels");
  if (deniedForPixels) return deniedForPixels;

  const { id } = await params;
  const row = await prisma.marketingPlatformConnection.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mapped = mapConnectionToTracking(row);
  if (mapped.unsupported) {
    return NextResponse.json(
      {
        ok: false,
        status: "unsupported_platform",
        message: "هذه المنصة لا يمكن تطبيقها على إعدادات البكسلات والتتبع مباشرة.",
      },
      { status: 400 }
    );
  }

  const changedFields = Object.keys(mapped.fields);
  if (changedFields.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        status: "missing_config",
        message: "لا توجد قيم قابلة للنقل من هذا الاتصال إلى إعدادات البكسلات. أكمل الحقول المطلوبة أولًا.",
        changedFields: [],
      },
      { status: 400 }
    );
  }

  const actor = auditActorFromDashboardSession(session!);
  mapped.fields.updatedBy = actor.actorId;
  const trackingId = await persistTrackingPatch(mapped.fields);

  await writeAuditLog({
    ...actor,
    stream: "TEAM",
    action: "TRACKING_SETTINGS_APPLIED_FROM_CONNECTION",
    messageAr: `طبّق إعدادات ${mapped.platformLabel} من اتصال المنصة على قسم البكسلات والتتبع`,
    entityType: "TrackingSettings",
    entityId: trackingId,
    metadata: redactSecretsFromMetadata({
      connectionId: row.id,
      connectionName: row.name,
      platform: row.platform,
      changedFields,
      secretFieldsChanged: changedFields.filter((f) => /token|secret/i.test(f)),
    }),
  });

  await writeAuditLog({
    ...actor,
    stream: "TEAM",
    action: "MARKETING_PLATFORM_CONNECTION_APPLIED_TO_PIXELS",
    messageAr: `استخدم اتصال ${row.name} لتحديث إعدادات البكسلات والتتبع`,
    entityType: "MarketingPlatformConnection",
    entityId: row.id,
    metadata: redactSecretsFromMetadata({
      trackingId,
      platform: row.platform,
      changedFields,
      secretFieldsChanged: changedFields.filter((f) => /token|secret/i.test(f)),
    }),
  });

  return NextResponse.json({
    ok: true,
    status: "applied",
    message: `تم تطبيق إعدادات ${mapped.platformLabel} على قسم البكسلات والتتبع بنجاح.`,
    changedFields,
  });
}
