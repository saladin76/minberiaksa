import { prisma } from "@/lib/prisma";
import type { BrandLocale, BrandMessageFramework, BrandMessageFrameworkType } from "./brand-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const createAction = "brand.message-framework.manual-create";
const updateAction = "brand.message-framework.manual-update";
const actions = [createAction, updateAction];
const frameworkTypes: BrandMessageFrameworkType[] = ["FRIDAY", "THANK_YOU", "ZAKAT", "WAQF", "EMERGENCY", "DONOR_REACTIVATION", "RAMADAN", "GENERAL"];
const locales: BrandLocale[] = ["ar", "tr", "en", "fr", "id", "pt", "es", "de"];

export type BrandMessageFrameworkActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

export type BrandMessageFrameworkWriteInput = {
  profileId?: string | null;
  name?: string | null;
  type?: string | null;
  locale?: string | null;
  structure?: string[] | null;
  sampleText?: string | null;
  doList?: string[] | null;
  dontList?: string[] | null;
};

export type BrandMessageFrameworkWriteResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  externalCall: false;
  message: string;
  status: number;
  data?: BrandMessageFramework;
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

function stringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => stringField(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  return items.length > 0 ? items : fallback;
}

function generatedBrandMessageFrameworkId() {
  return `brand_framework_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asFrameworkType(value: unknown): BrandMessageFrameworkType {
  const type = stringField(value)?.toUpperCase();
  return type && frameworkTypes.includes(type as BrandMessageFrameworkType) ? (type as BrandMessageFrameworkType) : "GENERAL";
}

function asLocale(value: unknown): BrandLocale {
  const locale = stringField(value)?.toLowerCase();
  return locale && locales.includes(locale as BrandLocale) ? (locale as BrandLocale) : "tr";
}

function frameworkFromMetadata(metadata: unknown): BrandMessageFramework | null {
  const root = metadataObject(metadata);
  const framework = metadataObject(root.brandMessageFramework);
  const id = stringField(framework.id);
  const profileId = stringField(framework.profileId);
  const name = stringField(framework.name);
  if (!id || !profileId || !name) return null;

  return {
    id,
    profileId,
    name,
    type: asFrameworkType(framework.type),
    locale: asLocale(framework.locale),
    structure: stringList(framework.structure, ["hook", "proof", "cta"]),
    sampleText: stringField(framework.sampleText) ?? "to be verified",
    doList: stringList(framework.doList),
    dontList: stringList(framework.dontList),
  };
}

export async function readAuditBackedBrandMessageFrameworks(): Promise<BrandMessageFramework[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "BrandMessageFramework", action: { in: actions } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, metadata: true },
    });

    const latest = new Map<string, BrandMessageFramework>();
    for (const row of rows) {
      const framework = frameworkFromMetadata(row.metadata);
      if (!framework) continue;
      if (!latest.has(framework.id ?? row.id)) latest.set(framework.id ?? row.id, framework);
    }

    return [...latest.values()];
  } catch (error) {
    console.error("Audit-backed brand message framework read failed", error);
    return [];
  }
}

function buildBrandMessageFramework(input: BrandMessageFrameworkWriteInput): BrandMessageFramework {
  return {
    id: generatedBrandMessageFrameworkId(),
    profileId: stringField(input.profileId) ?? "brand_gozbebekleri",
    name: stringField(input.name) ?? "Message framework to verify",
    type: asFrameworkType(input.type),
    locale: asLocale(input.locale),
    structure: stringList(input.structure, ["hook", "empathy", "proof", "cta"]),
    sampleText: stringField(input.sampleText) ?? "to be verified",
    doList: stringList(input.doList),
    dontList: stringList(input.dontList),
  };
}

export async function createAuditBackedBrandMessageFramework(input: BrandMessageFrameworkWriteInput, actor?: BrandMessageFrameworkActor | null): Promise<BrandMessageFrameworkWriteResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, mode: "foundation", externalCall: false, status: 503, message: "DATABASE_URL is not configured; brand message framework was not saved." };
  }

  const brandMessageFramework = buildBrandMessageFramework(input);

  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(actor?.actorId),
        actorName: actor?.actorName ?? undefined,
        actorRole: actor?.actorRole || "ADMIN",
        action: createAction,
        messageAr: "تمت إضافة إطار رسالة هوية يدوي",
        messageEn: "Manual brand message framework created",
        entityType: "BrandMessageFramework",
        entityId: brandMessageFramework.id,
        metadata: {
          brandMessageFramework,
          sourceType: "MANUAL_FRAMEWORK",
          externalCall: false,
          autoPublish: false,
          aiGenerated: false,
          humanReviewRequired: true,
        },
        stream: "TEAM",
      },
    });

    return { ok: true, mode: "prisma", externalCall: false, status: 201, message: "Brand message framework saved.", data: brandMessageFramework };
  } catch (error) {
    console.error("Brand message framework save failed", error);
    return { ok: false, mode: "prisma", externalCall: false, status: 503, message: "Brand message framework save failed." };
  }
}
