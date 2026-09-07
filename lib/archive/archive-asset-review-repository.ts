import { prisma } from "@/lib/prisma";
import type { ArchiveAsset } from "./archive-types";

const objectIdPattern = /^[a-f\d]{24}$/i;

export type ArchiveAssetReviewIntent = "APPROVE_MARKETING" | "APPROVE_DOCUMENTATION" | "REJECT";

export type ArchiveAssetReviewActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type ArchiveAssetReviewOverride = {
  assetId: string;
  marketingApproved: boolean;
  documentationApproved: boolean;
  humanReviewStatus: ArchiveAsset["humanReviewStatus"];
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
};

export type ArchiveAssetReviewResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  message: string;
  externalCall: false;
  data?: ArchiveAsset;
};

const reviewActions = [
  "archive.asset.approve-marketing",
  "archive.asset.approve-documentation",
  "archive.asset.reject",
];

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function boolField(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function reviewStatusField(value: unknown, fallback: ArchiveAsset["humanReviewStatus"]): ArchiveAsset["humanReviewStatus"] {
  return value === "APPROVED" || value === "REJECTED" || value === "DOCUMENTATION_ONLY" || value === "PENDING" ? value : fallback;
}

function actionForIntent(intent: ArchiveAssetReviewIntent) {
  if (intent === "APPROVE_MARKETING") return "archive.asset.approve-marketing";
  if (intent === "APPROVE_DOCUMENTATION") return "archive.asset.approve-documentation";
  return "archive.asset.reject";
}

function messagesForIntent(intent: ArchiveAssetReviewIntent) {
  if (intent === "APPROVE_MARKETING") {
    return { messageAr: "تم اعتماد أصل الأرشيف للتسويق", messageEn: "Archive asset approved for marketing" };
  }
  if (intent === "APPROVE_DOCUMENTATION") {
    return { messageAr: "تم اعتماد أصل الأرشيف للتوثيق", messageEn: "Archive asset approved for documentation" };
  }
  return { messageAr: "تم رفض أصل الأرشيف", messageEn: "Archive asset rejected" };
}

function overrideFromIntent(asset: ArchiveAsset, intent: ArchiveAssetReviewIntent, actor?: ArchiveAssetReviewActor | null): ArchiveAssetReviewOverride {
  const reviewedAt = new Date().toISOString();
  const reviewedBy = actor?.actorName || actor?.actorId || "dashboard-user";

  if (intent === "APPROVE_MARKETING") {
    return {
      assetId: asset.id,
      marketingApproved: true,
      documentationApproved: asset.documentationApproved,
      humanReviewStatus: "APPROVED",
      reviewedBy,
      reviewedAt,
      reviewerNote: "Human approved for marketing. No automatic AI approval.",
    };
  }

  if (intent === "APPROVE_DOCUMENTATION") {
    return {
      assetId: asset.id,
      marketingApproved: asset.marketingApproved,
      documentationApproved: true,
      humanReviewStatus: asset.marketingApproved ? "APPROVED" : "DOCUMENTATION_ONLY",
      reviewedBy,
      reviewedAt,
      reviewerNote: "Human approved for documentation. Marketing use still requires approval when not already approved.",
    };
  }

  return {
    assetId: asset.id,
    marketingApproved: false,
    documentationApproved: false,
    humanReviewStatus: "REJECTED",
    reviewedBy,
    reviewedAt,
    reviewerNote: "Human rejected this archive asset for current use.",
  };
}

function overrideFromMetadata(metadata: unknown): ArchiveAssetReviewOverride | null {
  const root = metadataObject(metadata);
  const review = metadataObject(root.review);
  const assetId = stringField(root.assetId) ?? stringField(review.assetId);
  if (!assetId) return null;

  return {
    assetId,
    marketingApproved: boolField(review.marketingApproved, false),
    documentationApproved: boolField(review.documentationApproved, false),
    humanReviewStatus: reviewStatusField(review.humanReviewStatus, "PENDING"),
    reviewedBy: stringField(review.reviewedBy),
    reviewedAt: stringField(review.reviewedAt),
    reviewerNote: stringField(review.reviewerNote),
  };
}

export function applyArchiveAssetReviewOverrides(
  assets: ArchiveAsset[],
  overrides: ArchiveAssetReviewOverride[],
): ArchiveAsset[] {
  if (overrides.length === 0) return assets;
  const latestByAsset = new Map(overrides.map((override) => [override.assetId, override]));
  return assets.map((asset) => {
    const override = latestByAsset.get(asset.id);
    if (!override) return asset;
    return {
      ...asset,
      marketingApproved: override.marketingApproved,
      documentationApproved: override.documentationApproved,
      humanReviewStatus: override.humanReviewStatus,
      reviewedBy: override.reviewedBy,
      reviewedAt: override.reviewedAt,
      reviewerNote: override.reviewerNote,
    };
  });
}

export async function readArchiveAssetReviewOverrides(): Promise<ArchiveAssetReviewOverride[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "ArchiveAsset", action: { in: reviewActions } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { metadata: true },
    });

    const latest = new Map<string, ArchiveAssetReviewOverride>();
    for (const row of rows) {
      const override = overrideFromMetadata(row.metadata);
      if (override && !latest.has(override.assetId)) latest.set(override.assetId, override);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Archive asset review override read failed", error);
    return [];
  }
}

export async function persistArchiveAssetReviewInRepository(
  asset: ArchiveAsset,
  intent: ArchiveAssetReviewIntent,
  actor?: ArchiveAssetReviewActor | null,
): Promise<ArchiveAssetReviewResult> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      mode: "foundation",
      externalCall: false,
      message: "DATABASE_URL is not configured; archive asset review was not saved.",
    };
  }

  try {
    const review = overrideFromIntent(asset, intent, actor);
    const messages = messagesForIntent(intent);
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: actionForIntent(intent),
        messageAr: messages.messageAr,
        messageEn: messages.messageEn,
        entityType: "ArchiveAsset",
        entityId: safeObjectId(asset.id),
        metadata: {
          assetId: asset.id,
          fileName: asset.fileName,
          intent,
          review,
          externalCall: false,
          humanApproved: true,
          aiApproved: false,
        },
        stream: "TEAM",
      },
    });

    return {
      ok: true,
      mode: "prisma",
      externalCall: false,
      message: "Archive asset review saved.",
      data: applyArchiveAssetReviewOverrides([asset], [review])[0],
    };
  } catch (error) {
    console.error("Archive asset review save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, message: "Archive asset review save failed." };
  }
}