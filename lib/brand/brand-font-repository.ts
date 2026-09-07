import { prisma } from "@/lib/prisma";
import type { BrandFont } from "./brand-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const createAction = "brand.font.manual-create";
const updateAction = "brand.font.manual-update";
const actions = [createAction, updateAction];

export type BrandFontActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type BrandFontWriteInput = {
  profileId?: string | null;
  name?: string | null;
  usage?: string | null;
  fallback?: string | null;
  source?: string | null;
  notes?: string | null;
};

export type BrandFontWriteResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: BrandFont;
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

function generatedBrandFontId() {
  return `brand_font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fontFromMetadata(metadata: unknown): BrandFont | null {
  const root = metadataObject(metadata);
  const font = metadataObject(root.brandFont);
  const id = stringField(font.id);
  const profileId = stringField(font.profileId);
  const name = stringField(font.name);
  if (!id || !profileId || !name) return null;

  return {
    id,
    profileId,
    name,
    usage: stringField(font.usage) ?? "to be verified",
    fallback: stringField(font.fallback) ?? "to be verified",
    source: stringField(font.source) ?? "to be verified",
    notes: stringField(font.notes) ?? "to be verified",
  };
}

export async function readAuditBackedBrandFonts(): Promise<BrandFont[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "BrandFont", action: { in: actions } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, metadata: true },
    });

    const latest = new Map<string, BrandFont>();
    for (const row of rows) {
      const font = fontFromMetadata(row.metadata);
      if (!font) continue;
      if (!latest.has(font.id ?? row.id)) latest.set(font.id ?? row.id, font);
    }

    return [...latest.values()];
  } catch (error) {
    console.error("Audit-backed brand font read failed", error);
    return [];
  }
}

function buildBrandFont(input: BrandFontWriteInput): BrandFont {
  return {
    id: generatedBrandFontId(),
    profileId: stringField(input.profileId) ?? "brand_gozbebekleri",
    name: stringField(input.name) ?? "Brand font to verify",
    usage: stringField(input.usage) ?? "to be verified",
    fallback: stringField(input.fallback) ?? "system-ui, sans-serif",
    source: stringField(input.source) ?? "to be verified",
    notes: stringField(input.notes) ?? "to be verified",
  };
}

export async function createAuditBackedBrandFont(input: BrandFontWriteInput, actor?: BrandFontActor | null): Promise<BrandFontWriteResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand font was not saved." };
  }

  const brandFont = buildBrandFont(input);

  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: createAction,
        messageAr: "تمت إضافة خط هوية يدوي",
        messageEn: "Manual brand font created",
        entityType: "BrandFont",
        entityId: brandFont.id,
        metadata: {
          brandFont,
          sourceType: "MANUAL_FONT",
          externalCall: false,
          fileDownloaded: false,
          autoPublish: false,
          aiGenerated: false,
          humanReviewRequired: true,
        },
        stream: "TEAM",
      },
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Brand font saved.", data: brandFont };
  } catch (error) {
    console.error("Brand font save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand font save failed." };
  }
}
