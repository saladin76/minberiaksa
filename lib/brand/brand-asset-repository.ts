import { prisma } from "@/lib/prisma";
import type { BrandAsset, BrandAssetFormat, BrandAssetType, BrandLocale, BrandProfileStatus } from "./brand-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const brandAssetCreateAction = "brand.asset.manual-create";
const brandAssetUpdateAction = "brand.asset.manual-update";
const brandAssetActions = [brandAssetCreateAction, brandAssetUpdateAction];
const assetTypes: BrandAssetType[] = ["LOGO", "ICON", "TEMPLATE", "CERTIFICATE", "WATERMARK", "VIDEO_INTRO", "VIDEO_OUTRO", "BRAND_GUIDE"];
const assetFormats: BrandAssetFormat[] = ["SVG", "PNG", "JPG", "PDF", "FIGMA", "VIDEO", "DOC", "URL"];
const locales: Array<BrandLocale | "all"> = ["all", "ar", "tr", "en", "fr", "id", "pt", "es", "de"];
const statuses: BrandProfileStatus[] = ["ACTIVE", "FOUNDATION", "TO_VERIFY"];

export type BrandAssetActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type BrandAssetWriteInput = {
  profileId?: string | null;
  title?: string | null;
  type?: string | null;
  format?: string | null;
  fileUrl?: string | null;
  previewUrl?: string | null;
  usage?: string | null;
  locale?: string | null;
  notes?: string | null;
  downloadable?: boolean | null;
  status?: string | null;
};

export type BrandAssetWriteResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: BrandAsset;
};

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function generatedBrandAssetId() {
  return `brand_asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asAssetType(value: unknown): BrandAssetType {
  const type = stringField(value)?.toUpperCase();
  return type && assetTypes.includes(type as BrandAssetType) ? (type as BrandAssetType) : "TEMPLATE";
}

function asAssetFormat(value: unknown): BrandAssetFormat {
  const format = stringField(value)?.toUpperCase();
  return format && assetFormats.includes(format as BrandAssetFormat) ? (format as BrandAssetFormat) : "URL";
}

function asAssetLocale(value: unknown): BrandLocale | "all" {
  const locale = stringField(value)?.toLowerCase();
  return locale && locales.includes(locale as BrandLocale | "all") ? (locale as BrandLocale | "all") : "all";
}

function asAssetStatus(value: unknown): BrandProfileStatus {
  const status = stringField(value)?.toUpperCase();
  return status && statuses.includes(status as BrandProfileStatus) ? (status as BrandProfileStatus) : "TO_VERIFY";
}

function brandAssetFromMetadata(metadata: unknown): BrandAsset | null {
  const root = metadataObject(metadata);
  const asset = metadataObject(root.brandAsset);
  const id = stringField(asset.id);
  const profileId = stringField(asset.profileId);
  const title = stringField(asset.title);
  if (!id || !profileId || !title) return null;

  return {
    id,
    profileId,
    title,
    type: asAssetType(asset.type),
    format: asAssetFormat(asset.format),
    fileUrl: stringField(asset.fileUrl),
    previewUrl: stringField(asset.previewUrl),
    usage: stringField(asset.usage) ?? "to be verified",
    locale: asAssetLocale(asset.locale),
    notes: stringField(asset.notes) ?? "to be verified",
    downloadable: Boolean(asset.downloadable),
    createdBy: stringField(asset.createdBy) ?? "brand-audit-log",
    status: asAssetStatus(asset.status),
  };
}

export async function readAuditBackedBrandAssets(): Promise<BrandAsset[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "BrandAsset", action: { in: brandAssetActions } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, metadata: true },
    });

    const latest = new Map<string, BrandAsset>();
    for (const row of rows) {
      const asset = brandAssetFromMetadata(row.metadata);
      if (!asset) continue;
      if (!latest.has(asset.id ?? row.id)) latest.set(asset.id ?? row.id, asset);
    }

    return [...latest.values()];
  } catch (error) {
    console.error("Audit-backed brand asset read failed", error);
    return [];
  }
}

function buildBrandAsset(input: BrandAssetWriteInput, actor?: BrandAssetActor | null): BrandAsset {
  return {
    id: generatedBrandAssetId(),
    profileId: stringField(input.profileId) ?? "brand_gozbebekleri",
    title: stringField(input.title) ?? "Brand asset to verify",
    type: asAssetType(input.type),
    format: asAssetFormat(input.format),
    fileUrl: stringField(input.fileUrl),
    previewUrl: stringField(input.previewUrl),
    usage: stringField(input.usage) ?? "to be verified",
    locale: asAssetLocale(input.locale),
    notes: stringField(input.notes) ?? "to be verified",
    downloadable: Boolean(input.downloadable),
    createdBy: actor?.actorName ?? actor?.actorId ?? "dashboard-user",
    status: asAssetStatus(input.status),
  };
}

export async function createAuditBackedBrandAsset(input: BrandAssetWriteInput, actor?: BrandAssetActor | null): Promise<BrandAssetWriteResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand asset was not saved." };
  }

  const brandAsset = buildBrandAsset(input, actor);

  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: brandAssetCreateAction,
        messageAr: "تمت إضافة أصل هوية يدوي",
        messageEn: "Manual brand asset created",
        entityType: "BrandAsset",
        entityId: brandAsset.id,
        metadata: {
          brandAsset,
          sourceType: "MANUAL_URL",
          externalCall: false,
          uploadPerformed: false,
          downloadPerformed: false,
          autoPublish: false,
          aiGenerated: false,
          humanReviewRequired: true,
        },
        stream: "TEAM",
      },
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Brand asset saved.", data: brandAsset };
  } catch (error) {
    console.error("Brand asset save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand asset save failed." };
  }
}
