import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

const COLLECTION = "TrackingSettings";

const PLAIN_FIELDS = [
  "facebookPixelId",
  "facebookTestEventCode",
  "metaDatasetId",
  "metaDonateEventName",
  "gaMeasurementId",
  "gaPropertyId",
  "gaStreamId",
  "gaDebugMode",
  "googleAdsConversionId",
  "googleAdsConversionLabel",
  "googleAdsCustomerId",
  "googleAdsConversionActionId",
  "googleAdsEnhancedConversionsEnabled",
  "tiktokPixelId",
  "tiktokAdvertiserId",
  "tiktokTestEventCode",
  "tiktokEventsApiEnabled",
  "xPixelId",
  "xConversionEventId",
  "xAdAccountId",
  "xConversionsApiEnabled",
] as const;

const SECRET_FIELDS = [
  "facebookAccessToken",
  "gaApiSecret",
  "tiktokAccessToken",
  "xAccessToken",
] as const;

type PlainField = (typeof PLAIN_FIELDS)[number];
type SecretField = (typeof SECRET_FIELDS)[number];
type AnyTrackingField = PlainField | SecretField;

type TrackingRaw = Partial<Record<AnyTrackingField | "id" | "_id" | "updatedBy", unknown>> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMongoId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.$oid === "string") return value.$oid;
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.$date === "string") return value.$date;
  return null;
}

function maskSecret(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const v = value.trim();
  const tail = v.slice(-4);
  return `••••••••${tail}`;
}

function looksMasked(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return v.includes("••") || /^\*+/.test(v) || /^•+$/.test(v);
}

function sanitizeScalar(value: unknown): string | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

async function getRawTrackingSettings(): Promise<TrackingRaw | null> {
  const result = await prisma.$runCommandRaw({
    find: COLLECTION,
    limit: 1,
    sort: { createdAt: 1 },
  });
  const batch = isPlainObject(result) && isPlainObject(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch
    : [];
  return (batch[0] as TrackingRaw | undefined) ?? null;
}

function serializeSettings(raw: TrackingRaw | null) {
  const output: Record<string, unknown> = {
    id: raw ? normalizeMongoId(raw._id) ?? normalizeMongoId(raw.id) : null,
  };

  for (const field of PLAIN_FIELDS) {
    if (field.endsWith("Enabled") || field === "gaDebugMode") {
      output[field] = Boolean(raw?.[field]);
    } else if (field === "metaDonateEventName") {
      output[field] = typeof raw?.[field] === "string" && raw[field]
        ? raw[field]
        : "Donate";
    } else {
      output[field] = typeof raw?.[field] === "string" ? raw[field] : null;
    }
  }

  for (const field of SECRET_FIELDS) {
    const secret = raw?.[field];
    output[`${field}Present`] = typeof secret === "string" && secret.trim().length > 0;
    output[`${field}Masked`] = maskSecret(secret);
  }

  output.createdAt = normalizeDate(raw?.createdAt);
  output.updatedAt = normalizeDate(raw?.updatedAt);
  output.updatedBy = typeof raw?.updatedBy === "string" ? raw.updatedBy : null;

  return output;
}

function buildUpdateFromBody(body: Record<string, unknown>, existing: TrackingRaw | null) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  const changedFields: string[] = [];
  const secretFieldsChanged: Record<string, boolean> = {};

  for (const field of PLAIN_FIELDS) {
    if (!(field in body)) continue;
    const next = sanitizeScalar(body[field]);
    const current = existing?.[field] ?? null;
    if (next !== current) {
      $set[field] = next;
      changedFields.push(field);
    }
  }

  if (!("metaDonateEventName" in body) && !existing?.metaDonateEventName) {
    $set.metaDonateEventName = "Donate";
  }

  const clearFlagBySecret: Record<SecretField, string> = {
    facebookAccessToken: "clearFacebookAccessToken",
    gaApiSecret: "clearGaApiSecret",
    tiktokAccessToken: "clearTiktokAccessToken",
    xAccessToken: "clearXAccessToken",
  };

  for (const field of SECRET_FIELDS) {
    secretFieldsChanged[field] = false;
    const clearFlag = clearFlagBySecret[field];
    if (body[clearFlag] === true) {
      $unset[field] = "";
      changedFields.push(field);
      secretFieldsChanged[field] = true;
      continue;
    }
    if (!(field in body)) continue;
    const value = body[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || looksMasked(trimmed)) continue;
    if (trimmed !== existing?.[field]) {
      $set[field] = trimmed;
      changedFields.push(field);
      secretFieldsChanged[field] = true;
    }
  }

  return { $set, $unset, changedFields, secretFieldsChanged };
}

async function persistRawSettings(update: { $set: Record<string, unknown>; $unset: Record<string, ""> }, existing: TrackingRaw | null) {
  const now = new Date();
  const id = normalizeMongoId(existing?._id) ?? normalizeMongoId(existing?.id);

  if (id) {
    const command: Record<string, unknown> = {
      update: COLLECTION,
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            ...(Object.keys(update.$set).length ? { $set: { ...update.$set, updatedAt: now } } : { $set: { updatedAt: now } }),
            ...(Object.keys(update.$unset).length ? { $unset: update.$unset } : {}),
          },
          upsert: false,
        },
      ],
    };
    await prisma.$runCommandRaw(command);
    return getRawTrackingSettings();
  }

  const insertDoc = {
    ...update.$set,
    createdAt: now,
    updatedAt: now,
    metaDonateEventName: update.$set.metaDonateEventName ?? "Donate",
  };
  await prisma.$runCommandRaw({ insert: COLLECTION, documents: [insertDoc] });
  return getRawTrackingSettings();
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "pixels");
    if (denied) return denied;

    const settings = await getRawTrackingSettings();
    return NextResponse.json(serializeSettings(settings));
  } catch (e) {
    console.error("Error fetching tracking settings:", e);
    return NextResponse.json({ error: "Failed to fetch tracking settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "pixels");
    if (denied) return denied;

    const bodyRaw = await request.json().catch(() => null);
    if (!isPlainObject(bodyRaw)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const existing = await getRawTrackingSettings();
    const actor = auditActorFromDashboardSession(session!);
    const update = buildUpdateFromBody(
      {
        ...bodyRaw,
        updatedBy: actor.actorId,
      },
      existing
    );
    update.$set.updatedBy = actor.actorId;

    const saved = await persistRawSettings(update, existing);

    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: "TRACKING_SETTINGS_UPDATED",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل إعدادات البكسلات والتتبع`,
      entityType: "TrackingSettings",
      entityId: normalizeMongoId(saved?._id) ?? undefined,
      metadata: {
        changedFields: update.changedFields,
        secretFieldsChanged: update.secretFieldsChanged,
      },
    });

    return NextResponse.json(serializeSettings(saved));
  } catch (e) {
    console.error("Error updating tracking settings:", e);
    return NextResponse.json({ error: "Failed to update tracking settings" }, { status: 500 });
  }
}
