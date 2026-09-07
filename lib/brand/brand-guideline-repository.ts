import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import type { BrandGuideline, BrandGuidelineSection } from "./brand-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const organizationKeys = ["gozbebekleri", "minber_aksa", "burak"];
const guidelineSections: BrandGuidelineSection[] = ["voice", "copy", "proof", "donor-dignity", "cta", "localization"];

export type BrandGuidelineActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type BrandGuidelineWriteInput = {
  profileId?: string | null;
  section?: string | null;
  title?: string | null;
  body?: string | null;
  examples?: string[] | null;
  order?: number | null;
};

export type BrandGuidelineWriteResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: BrandGuideline;
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

function asGuidelineSection(value: unknown): BrandGuidelineSection {
  const section = stringField(value)?.toLowerCase();
  return section && guidelineSections.includes(section as BrandGuidelineSection) ? (section as BrandGuidelineSection) : "copy";
}

function cleanExamples(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => stringField(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
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

export async function createBrandGuideline(input: BrandGuidelineWriteInput, actor?: BrandGuidelineActor | null): Promise<BrandGuidelineWriteResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand guideline was not saved." };
  }

  const profile = await resolveBrandProfile(input.profileId);
  if (!profile) {
    return { ok: false, mode: "prisma", externalCall: false, status: 404, message: "No BrandProfile exists for this guideline." };
  }

  const section = asGuidelineSection(input.section);
  const title = stringField(input.title) ?? "Brand rule to verify";
  const body = stringField(input.body) ?? "to be verified";
  const examples = cleanExamples(input.examples);
  const order = Number.isFinite(input.order) ? Math.max(0, Math.trunc(Number(input.order))) : 0;

  try {
    const created = await prisma.brandGuideline.create({
      data: {
        profileId: profile.id,
        section,
        title,
        body,
        examples,
        order,
        createdBy: safeObjectId(actor?.actorId),
      },
    });

    const guideline: BrandGuideline = {
      id: created.id,
      profileId: stableProfileId(profile.key, profile.id),
      section: asGuidelineSection(created.section),
      title: created.title,
      body: created.body,
      examples: created.examples,
      order: created.order,
    };

    await writeAuditLog({
      actorId: safeObjectId(actor?.actorId),
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole || "ADMIN",
      action: "brand.guideline.create",
      messageAr: "تمت إضافة قاعدة هوية",
      messageEn: "Brand guideline created",
      entityType: "BrandGuideline",
      entityId: created.id,
      metadata: {
        guideline,
        profile: { id: stableProfileId(profile.key, profile.id), name: profile.name },
        externalCall: false,
        autoPublish: false,
        aiGenerated: false,
        humanReviewRequired: true,
      },
      stream: "TEAM",
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Brand guideline saved.", data: guideline };
  } catch (error) {
    console.error("Brand guideline save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand guideline save failed." };
  }
}
