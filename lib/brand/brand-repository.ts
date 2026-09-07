import { prisma } from "@/lib/prisma";
import { readAuditBackedBrandAssets } from "./brand-asset-repository";
import { readAuditBackedBrandFonts } from "./brand-font-repository";
import { readAuditBackedBrandMessageFrameworks } from "./brand-message-framework-repository";
import {
  brandAssets,
  brandColors,
  brandFonts,
  brandGuidelines,
  brandMessageFrameworks,
  brandProfiles,
} from "./brand-data";
import type {
  BrandAsset,
  BrandColor,
  BrandFont,
  BrandGuideline,
  BrandLocale,
  BrandMessageFramework,
  BrandOrganizationKey,
  BrandProfile,
  BrandProfileStatus,
} from "./brand-types";

const organizationKeys: BrandOrganizationKey[] = ["gozbebekleri", "minber_aksa", "burak"];
const locales: BrandLocale[] = ["ar", "tr", "en", "fr", "id", "pt", "es", "de"];
const profileStatuses: BrandProfileStatus[] = ["ACTIVE", "FOUNDATION", "TO_VERIFY"];
const assetTypes: BrandAsset["type"][] = ["LOGO", "ICON", "TEMPLATE", "CERTIFICATE", "WATERMARK", "VIDEO_INTRO", "VIDEO_OUTRO", "BRAND_GUIDE"];
const assetFormats: BrandAsset["format"][] = ["SVG", "PNG", "JPG", "PDF", "FIGMA", "VIDEO", "DOC", "URL"];
const colorUsages: BrandColor["usage"][] = ["PRIMARY", "CTA", "BACKGROUND", "ACCENT", "TEXT", "STATUS"];
const guidelineSections: BrandGuideline["section"][] = ["voice", "copy", "proof", "donor-dignity", "cta", "localization"];
const frameworkTypes: BrandMessageFramework["type"][] = [
  "FRIDAY",
  "THANK_YOU",
  "ZAKAT",
  "WAQF",
  "EMERGENCY",
  "DONOR_REACTIVATION",
  "RAMADAN",
  "GENERAL",
];

type BrandAssetRow = {
  id: string;
  profileId: string;
  title: string;
  type: string;
  format: string;
  fileUrl: string | null;
  previewUrl: string | null;
  usage: string;
  locale: string;
  notes: string | null;
  downloadable: boolean;
  status: string;
  createdBy: string | null;
};

type BrandFontRow = {
  id: string;
  profileId: string;
  name: string;
  usage: string;
  fallback: string | null;
  source: string | null;
  notes: string | null;
};

type BrandMessageFrameworkRow = {
  id: string;
  profileId: string;
  name: string;
  type: string;
  locale: string;
  structure: string[];
  sampleText: string | null;
  doList: string[];
  dontList: string[];
};

type BrandAssetDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<BrandAssetRow[]>;
};

type BrandFontDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<BrandFontRow[]>;
};

type BrandMessageFrameworkDelegate = {
  findMany(args: { orderBy: Array<Record<string, "asc" | "desc">> }): Promise<BrandMessageFrameworkRow[]>;
};

export type BrandRepositoryPersistenceMode = "db-backed" | "foundation-fallback";

export type BrandRepositorySnapshot = {
  mode: BrandRepositoryPersistenceMode;
  source: "prisma" | "foundation";
  reason: string;
  profiles: BrandProfile[];
  assets: BrandAsset[];
  colors: BrandColor[];
  fonts: BrandFont[];
  guidelines: BrandGuideline[];
  messageFrameworks: BrandMessageFramework[];
  dbCounts: {
    profiles: number;
    assets: number;
    colors: number;
    fonts: number;
    guidelines: number;
    messageFrameworks: number;
  };
};

function isKnownOrganizationKey(value: string | null | undefined): value is BrandOrganizationKey {
  return Boolean(value && organizationKeys.includes(value as BrandOrganizationKey));
}

function asLocale(value: string | null | undefined): BrandLocale {
  return locales.includes(value as BrandLocale) ? (value as BrandLocale) : "tr";
}

function asAssetLocale(value: string | null | undefined): BrandAsset["locale"] {
  return value === "all" ? "all" : asLocale(value);
}

function asLocales(values: string[] | null | undefined): BrandLocale[] {
  const safe = (values ?? []).filter((value): value is BrandLocale => locales.includes(value as BrandLocale));
  return safe.length > 0 ? safe : ["tr"];
}

function asProfileStatus(value: string | null | undefined): BrandProfileStatus {
  return profileStatuses.includes(value as BrandProfileStatus) ? (value as BrandProfileStatus) : "FOUNDATION";
}

function asAssetType(value: string | null | undefined): BrandAsset["type"] {
  return assetTypes.includes(value as BrandAsset["type"]) ? (value as BrandAsset["type"]) : "TEMPLATE";
}

function asAssetFormat(value: string | null | undefined): BrandAsset["format"] {
  return assetFormats.includes(value as BrandAsset["format"]) ? (value as BrandAsset["format"]) : "URL";
}

function asColorUsage(value: string | null | undefined): BrandColor["usage"] {
  return colorUsages.includes(value as BrandColor["usage"]) ? (value as BrandColor["usage"]) : "ACCENT";
}

function asGuidelineSection(value: string | null | undefined): BrandGuideline["section"] {
  return guidelineSections.includes(value as BrandGuideline["section"]) ? (value as BrandGuideline["section"]) : "copy";
}

function asFrameworkType(value: string | null | undefined): BrandMessageFramework["type"] {
  return frameworkTypes.includes(value as BrandMessageFramework["type"]) ? (value as BrandMessageFramework["type"]) : "GENERAL";
}

function stableProfileId(key: string, dbId: string) {
  return isKnownOrganizationKey(key) ? `brand_${key}` : dbId;
}

function getBrandAssetDelegate(): BrandAssetDelegate | null {
  const prismaWithBrandAsset = prisma as unknown as { brandAsset?: BrandAssetDelegate };
  return prismaWithBrandAsset.brandAsset ?? null;
}

function getBrandFontDelegate(): BrandFontDelegate | null {
  const prismaWithBrandFont = prisma as unknown as { brandFont?: BrandFontDelegate };
  return prismaWithBrandFont.brandFont ?? null;
}

function getBrandMessageFrameworkDelegate(): BrandMessageFrameworkDelegate | null {
  const prismaWithBrandMessageFramework = prisma as unknown as { brandMessageFramework?: BrandMessageFrameworkDelegate };
  return prismaWithBrandMessageFramework.brandMessageFramework ?? null;
}

function fallback(reason: string): BrandRepositorySnapshot {
  return {
    mode: "foundation-fallback",
    source: "foundation",
    reason,
    profiles: brandProfiles,
    assets: brandAssets,
    colors: brandColors,
    fonts: brandFonts,
    guidelines: brandGuidelines,
    messageFrameworks: brandMessageFrameworks,
    dbCounts: {
      profiles: 0,
      assets: 0,
      colors: 0,
      fonts: 0,
      guidelines: 0,
      messageFrameworks: 0,
    },
  };
}

function mergeBrandAssets(baseAssets: BrandAsset[], auditAssets: BrandAsset[], profiles: BrandProfile[]) {
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const merged = new Map<string, BrandAsset>();
  for (const asset of baseAssets) {
    if (profileIds.has(asset.profileId)) merged.set(asset.id, asset);
  }
  for (const asset of auditAssets) {
    if (profileIds.has(asset.profileId)) merged.set(asset.id, asset);
  }
  return [...merged.values()];
}

function mergeBrandFonts(baseFonts: BrandFont[], auditFonts: BrandFont[], profiles: BrandProfile[]) {
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const merged = new Map<string, BrandFont>();
  for (const font of baseFonts) {
    if (profileIds.has(font.profileId)) merged.set(font.id, font);
  }
  for (const font of auditFonts) {
    if (profileIds.has(font.profileId)) merged.set(font.id, font);
  }
  return [...merged.values()];
}

function mergeBrandMessageFrameworks(baseFrameworks: BrandMessageFramework[], auditFrameworks: BrandMessageFramework[], profiles: BrandProfile[]) {
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const merged = new Map<string, BrandMessageFramework>();
  for (const framework of baseFrameworks) {
    if (profileIds.has(framework.profileId)) merged.set(framework.id, framework);
  }
  for (const framework of auditFrameworks) {
    if (profileIds.has(framework.profileId)) merged.set(framework.id, framework);
  }
  return [...merged.values()];
}

export async function getBrandRepositorySnapshot(): Promise<BrandRepositorySnapshot> {
  if (!process.env.DATABASE_URL) {
    return fallback("DATABASE_URL is not configured; using foundation brand data.");
  }

  try {
    const brandAssetDelegate = getBrandAssetDelegate();
    const brandFontDelegate = getBrandFontDelegate();
    const brandMessageFrameworkDelegate = getBrandMessageFrameworkDelegate();
    const [profileRows, assetRows, auditAssetRows, colorRows, fontRows, auditFontRows, guidelineRows, frameworkRows, auditFrameworkRows] = await Promise.all([
      prisma.brandProfile.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      brandAssetDelegate ? brandAssetDelegate.findMany({ orderBy: [{ title: "asc" }] }) : Promise.resolve([]),
      readAuditBackedBrandAssets(),
      prisma.brandColor.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
      brandFontDelegate ? brandFontDelegate.findMany({ orderBy: [{ name: "asc" }] }) : Promise.resolve([]),
      readAuditBackedBrandFonts(),
      prisma.brandGuideline.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }] }),
      brandMessageFrameworkDelegate
        ? brandMessageFrameworkDelegate.findMany({ orderBy: [{ name: "asc" }] })
        : Promise.resolve([]),
      readAuditBackedBrandMessageFrameworks(),
    ]);

    if (profileRows.length === 0) {
      return fallback("BrandProfile collection is empty; using foundation brand data.");
    }

    const profileIdByDbId = new Map<string, string>();
    const profiles = profileRows.map((profile): BrandProfile => {
      const uiId = stableProfileId(profile.key, profile.id);
      profileIdByDbId.set(profile.id, uiId);

      return {
        id: uiId,
        key: isKnownOrganizationKey(profile.key) ? profile.key : "gozbebekleri",
        name: profile.name,
        description: profile.description ?? "to be verified",
        mission: profile.mission ?? "to be verified",
        vision: profile.vision ?? "to be verified",
        contentVoice: profile.contentVoice ?? "to be verified",
        messagePhilosophy: profile.messagePhilosophy ?? "to be verified",
        primaryLocale: asLocale(profile.primaryLocale),
        supportedLocales: asLocales(profile.supportedLocales),
        website: profile.website ?? "to be verified",
        isActive: profile.isActive,
        status: asProfileStatus(profile.status),
        verificationNote: profile.verificationNote ?? "to be verified",
      };
    });

    const assets = assetRows
      .map((asset): BrandAsset | null => {
        const profileId = profileIdByDbId.get(asset.profileId);
        if (!profileId) return null;
        return {
          id: asset.id,
          profileId,
          title: asset.title,
          type: asAssetType(asset.type),
          format: asAssetFormat(asset.format),
          fileUrl: asset.fileUrl,
          previewUrl: asset.previewUrl,
          usage: asset.usage,
          locale: asAssetLocale(asset.locale),
          notes: asset.notes ?? "to be verified",
          downloadable: asset.downloadable,
          createdBy: asset.createdBy ?? "brand-db",
          status: asProfileStatus(asset.status),
        };
      })
      .filter((asset): asset is BrandAsset => Boolean(asset));

    const colors = colorRows
      .map((color): BrandColor | null => {
        const profileId = profileIdByDbId.get(color.profileId);
        if (!profileId) return null;
        return {
          id: color.id,
          profileId,
          name: color.name,
          hex: color.hex,
          rgb: color.rgb ?? "to be verified",
          usage: asColorUsage(color.usage),
          description: color.description ?? "to be verified",
          order: color.order,
        };
      })
      .filter((color): color is BrandColor => Boolean(color));

    const fonts = fontRows
      .map((font): BrandFont | null => {
        const profileId = profileIdByDbId.get(font.profileId);
        if (!profileId) return null;
        return {
          id: font.id,
          profileId,
          name: font.name,
          usage: font.usage,
          fallback: font.fallback ?? "to be verified",
          source: font.source ?? "to be verified",
          notes: font.notes ?? "to be verified",
        };
      })
      .filter((font): font is BrandFont => Boolean(font));

    const guidelines = guidelineRows
      .map((guideline): BrandGuideline | null => {
        const profileId = profileIdByDbId.get(guideline.profileId);
        if (!profileId) return null;
        return {
          id: guideline.id,
          profileId,
          section: asGuidelineSection(guideline.section),
          title: guideline.title,
          body: guideline.body,
          examples: guideline.examples,
          order: guideline.order,
        };
      })
      .filter((guideline): guideline is BrandGuideline => Boolean(guideline));

    const messageFrameworks = frameworkRows
      .map((framework): BrandMessageFramework | null => {
        const profileId = profileIdByDbId.get(framework.profileId);
        if (!profileId) return null;
        return {
          id: framework.id,
          profileId,
          name: framework.name,
          type: asFrameworkType(framework.type),
          locale: asLocale(framework.locale),
          structure: framework.structure,
          sampleText: framework.sampleText ?? "to be verified",
          doList: framework.doList,
          dontList: framework.dontList,
        };
      })
      .filter((framework): framework is BrandMessageFramework => Boolean(framework));

    const availableOptionalModels = [
      brandAssetDelegate ? "BrandAsset" : null,
      brandFontDelegate ? "BrandFont" : null,
      brandMessageFrameworkDelegate ? "BrandMessageFramework" : null,
    ].filter((model): model is string => Boolean(model));
    const reasonParts = availableOptionalModels.length > 0
      ? [`Brand repository can read optional runtime delegates for ${availableOptionalModels.join(", ")}.`]
      : ["BrandProfile, BrandColor, and BrandGuideline are read from Prisma; BrandAsset, BrandFont, and BrandMessageFramework use foundation fallback until the generated Prisma Client exposes their delegates."];
    if (auditAssetRows.length > 0) {
      reasonParts.push(`${auditAssetRows.length} BrandAsset record(s) are currently audit-backed manual URL records.`);
    }
    if (auditFontRows.length > 0) {
      reasonParts.push(`${auditFontRows.length} BrandFont record(s) are currently audit-backed manual font records.`);
    }
    if (auditFrameworkRows.length > 0) {
      reasonParts.push(`${auditFrameworkRows.length} BrandMessageFramework record(s) are currently audit-backed manual framework records.`);
    }

    const foundationAssets = brandAssets.filter((asset) => profiles.some((profile) => profile.id === asset.profileId));
    const foundationFonts = brandFonts.filter((font) => profiles.some((profile) => profile.id === font.profileId));
    const foundationFrameworks = brandMessageFrameworks.filter((framework) => profiles.some((profile) => profile.id === framework.profileId));

    return {
      mode: "db-backed",
      source: "prisma",
      reason: reasonParts.join(" "),
      profiles,
      assets: mergeBrandAssets(assets.length > 0 ? assets : foundationAssets, auditAssetRows, profiles),
      colors: colors.length > 0 ? colors : brandColors.filter((color) => profiles.some((profile) => profile.id === color.profileId)),
      fonts: mergeBrandFonts(fonts.length > 0 ? fonts : foundationFonts, auditFontRows, profiles),
      guidelines: guidelines.length > 0 ? guidelines : brandGuidelines.filter((guideline) => profiles.some((profile) => profile.id === guideline.profileId)),
      messageFrameworks: mergeBrandMessageFrameworks(messageFrameworks.length > 0 ? messageFrameworks : foundationFrameworks, auditFrameworkRows, profiles),
      dbCounts: {
        profiles: profileRows.length,
        assets: assetRows.length + auditAssetRows.length,
        colors: colorRows.length,
        fonts: fontRows.length + auditFontRows.length,
        guidelines: guidelineRows.length,
        messageFrameworks: frameworkRows.length + auditFrameworkRows.length,
      },
    };
  } catch (error) {
    console.error("Brand repository DB read failed", error);
    return fallback("Brand repository DB read failed; using foundation brand data.");
  }
}