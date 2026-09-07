import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import type { BrandColor, BrandColorUsage } from "./brand-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const organizationKeys = ["gozbebekleri", "minber_aksa", "burak"];
const colorUsages: BrandColorUsage[] = ["PRIMARY", "CTA", "BACKGROUND", "ACCENT", "TEXT", "STATUS"];

export type BrandColorActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type BrandColorWriteInput = {
  profileId?: string | null;
  name?: string | null;
  hex?: string | null;
  rgb?: string | null;
  usage?: string | null;
  description?: string | null;
  order?: number | null;
};

export type BrandColorWriteResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: BrandColor;
};

type BrandProfileRef = {
  id: string;
  key: string;
  name: string;
};

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableProfileId(key: string, dbId: string) {
  return organizationKeys.includes(key) ? `brand_${key}` : dbId;
}

function normalizeHex(value: unknown) {
  const raw = stringField(value)?.replace(/^#/, "").toUpperCase();
  return raw && /^[0-9A-F]{6}$/.test(raw) ? `#${raw}` : "#10212B";
}

function rgbFromHex(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

function asColorUsage(value: unknown): BrandColorUsage {
  const usage = stringField(value)?.toUpperCase();
  return usage && colorUsages.includes(usage as BrandColorUsage) ? (usage as BrandColorUsage) : "ACCENT";
}

async function resolveBrandProfile(inputProfileId: unknown): Promise<BrandProfileRef | null> {
  const profileId = stringField(inputProfileId);
  const keyFromUiId = profileId?.startsWith("brand_") ? profileId.slice("brand_".length) : null;

  if (keyFromUiId) {
    const profile = await prisma.brandProfile.findUnique({
      where: { key: keyFromUiId },
      select: { id: true, key: true, name: true },
    });
    if (profile) return profile;
  }

  const dbProfileId = safeObjectId(profileId);
  if (dbProfileId) {
    const profile = await prisma.brandProfile.findUnique({
      where: { id: dbProfileId },
      select: { id: true, key: true, name: true },
    });
    if (profile) return profile;
  }

  const activeProfile = await prisma.brandProfile.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, key: true, name: true },
  });
  if (activeProfile) return activeProfile;

  return prisma.brandProfile.findFirst({
    orderBy: { name: "asc" },
    select: { id: true, key: true, name: true },
  });
}

export async function createBrandColor(input: BrandColorWriteInput, actor?: BrandColorActor | null): Promise<BrandColorWriteResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand color was not saved." };
  }

  const profile = await resolveBrandProfile(input.profileId);
  if (!profile) {
    return { ok: false, mode: "prisma", externalCall: false, status: 404, message: "No BrandProfile exists for this color." };
  }

  const hex = normalizeHex(input.hex);
  const rgb = stringField(input.rgb) ?? rgbFromHex(hex);
  const usage = asColorUsage(input.usage);
  const name = stringField(input.name) ?? `${usage} color`;
  const description = stringField(input.description) ?? "to be verified";
  const order = Number.isFinite(input.order) ? Math.max(0, Math.trunc(Number(input.order))) : 0;

  try {
    const created = await prisma.brandColor.create({
      data: {
        profileId: profile.id,
        name,
        hex,
        rgb,
        usage,
        description,
        order,
        createdBy: safeObjectId(actor?.actorId),
      },
    });

    const brandColor: BrandColor = {
      id: created.id,
      profileId: stableProfileId(profile.key, profile.id),
      name: created.name,
      hex: created.hex,
      rgb: created.rgb ?? rgb,
      usage: asColorUsage(created.usage),
      description: created.description ?? description,
      order: created.order,
    };

    await writeAuditLog({
      actorId: safeObjectId(actor?.actorId),
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole || "ADMIN",
      action: "brand.color.create",
      messageAr: "تمت إضافة لون هوية",
      messageEn: "Brand color created",
      entityType: "BrandColor",
      entityId: created.id,
      metadata: {
        brandColor,
        profile: { id: stableProfileId(profile.key, profile.id), name: profile.name },
        externalCall: false,
        autoPublish: false,
        aiGenerated: false,
        humanReviewRequired: true,
      },
      stream: "TEAM",
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Brand color saved.", data: brandColor };
  } catch (error) {
    console.error("Brand color save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand color save failed." };
  }
}
