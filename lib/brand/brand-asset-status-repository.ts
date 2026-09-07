import { prisma } from "@/lib/prisma";
import type { BrandAsset, BrandProfileStatus } from "./brand-types";
import type { BrandAssetActor } from "./brand-asset-repository";

const objectIdPattern = /^[a-f\d]{24}$/i;
const brandAssetUpdateAction = "brand.asset.manual-update";
const statuses: BrandProfileStatus[] = ["ACTIVE", "FOUNDATION", "TO_VERIFY"];

export type BrandAssetStatusInput = {
  status?: string | null;
  downloadable?: boolean | null;
  notes?: string | null;
};

export type BrandAssetStatusResult = {
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

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asAssetStatus(value: unknown, fallback: BrandProfileStatus): BrandProfileStatus {
  const status = stringField(value)?.toUpperCase();
  return status && statuses.includes(status as BrandProfileStatus) ? (status as BrandProfileStatus) : fallback;
}

export async function updateAuditBackedBrandAssetStatus(
  existing: BrandAsset,
  input: BrandAssetStatusInput,
  actor?: BrandAssetActor | null,
): Promise<BrandAssetStatusResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand asset status was not saved." };
  }

  const nextStatus = asAssetStatus(input.status, existing.status);
  if (nextStatus === "ACTIVE" && !existing.fileUrl) {
    return { ok: false, mode: "prisma", externalCall: false, status: 400, message: "Brand asset needs a verified file URL before activation." };
  }

  const brandAsset: BrandAsset = {
    ...existing,
    status: nextStatus,
    downloadable: typeof input.downloadable === "boolean" ? input.downloadable : existing.downloadable,
    notes: stringField(input.notes) ?? existing.notes,
    createdBy: existing.createdBy || actor?.actorName || actor?.actorId || "dashboard-user",
  };

  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: brandAssetUpdateAction,
        messageAr: "تم تحديث حالة أصل الهوية يدويًا",
        messageEn: "Manual brand asset status updated",
        entityType: "BrandAsset",
        entityId: brandAsset.id,
        metadata: {
          brandAsset,
          previousStatus: existing.status,
          nextStatus,
          previousDownloadable: existing.downloadable,
          nextDownloadable: brandAsset.downloadable,
          externalCall: false,
          uploadPerformed: false,
          downloadPerformed: false,
          autoPublish: false,
          aiGenerated: false,
          humanApproved: nextStatus === "ACTIVE",
          humanReviewRequired: nextStatus !== "ACTIVE",
        },
        stream: "TEAM",
      },
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 200, message: "Brand asset status updated.", data: brandAsset };
  } catch (error) {
    console.error("Brand asset status update failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand asset status update failed." };
  }
}
