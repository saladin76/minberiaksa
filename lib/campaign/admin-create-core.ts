import { SUPPORTED_LOCALES } from "../locales";
import { parseCampaignFaqContent } from "./seo-fields";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export const CAMPAIGN_TRANSLATION_LOCALES = SUPPORTED_LOCALES.filter(
  (locale): locale is Exclude<(typeof SUPPORTED_LOCALES)[number], "ar"> =>
    locale !== "ar",
);

export type CampaignTranslationLocale =
  (typeof CAMPAIGN_TRANSLATION_LOCALES)[number];

export class CampaignCreateValidationError extends Error {
  readonly status = 400;

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "CampaignCreateValidationError";
  }
}

export type CampaignCreateExtras = {
  categoryPriorities: unknown;
  suggestedDonations: unknown;
  suggestedTeamSupport: unknown;
  suggestedShareCounts: unknown;
  shareLabels: unknown;
};

export type ParsedCampaignTranslation = {
  locale: CampaignTranslationLocale;
  title: string;
  description: string;
  image: string | null;
  videoUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  seoNoIndex: string | null;
  faqContent: string | null;
  slugBase: string;
};

export type ParsedCampaignCreatePayload = CampaignCreateExtras & {
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  images: string[];
  videoUrl: string | null;
  isActive: boolean;
  priority: number | null;
  goalType: "FIXED" | "OPEN";
  fundraisingMode: "AMOUNT" | "SHARES";
  sharePriceUSD: number | null;
  categoryIds: string[];
  slugBase: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  seoNoIndex: string | null;
  faqContent: string | null;
  translations: ParsedCampaignTranslation[];
};

export type CampaignPersistenceData = CampaignCreateExtras & {
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  images: string[];
  videoUrl: string | null;
  isActive: boolean;
  priority: number | null;
  goalType: "FIXED" | "OPEN";
  fundraisingMode: "AMOUNT" | "SHARES";
  sharePriceUSD: number | null;
  categoryIds: string[];
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  seoNoIndex: string | null;
  faqContent: string | null;
};

export type CampaignTranslationPersistenceData = {
  campaignId: string;
  locale: CampaignTranslationLocale;
  title: string;
  description: string;
  image: string | null;
  videoUrl: string | null;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  seoNoIndex: string | null;
  faqContent: string | null;
};

export type CampaignCreateTransaction = {
  findCategories: (
    categoryIds: string[],
  ) => Promise<Array<{ id: string; isActive: boolean | null }>>;
  generateCampaignSlug: (base: string) => Promise<string>;
  generateTranslationSlug: (
    locale: CampaignTranslationLocale,
    base: string,
  ) => Promise<string>;
  createCampaign: (
    data: CampaignPersistenceData,
  ) => Promise<{ id: string; title: string }>;
  createTranslation: (
    data: CampaignTranslationPersistenceData,
  ) => Promise<void>;
  getCreatedCampaign: (campaignId: string) => Promise<unknown>;
};

export type CampaignCreateDependencies = {
  transaction: <T>(
    operation: (tx: CampaignCreateTransaction) => Promise<T>,
  ) => Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredTrimmedString(
  value: unknown,
  field: string,
  label: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CampaignCreateValidationError(`${label} is required`, field);
  }
  return value.trim();
}

function hasMeaningfulEditorContent(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith("{")) return true;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const current = stack.pop();
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) {
        stack.push(...current);
        continue;
      }
      const record = current as Record<string, unknown>;
      if (typeof record.text === "string" && record.text.trim()) return true;
      for (const child of Object.values(record)) stack.push(child);
    }
    return false;
  } catch {
    return true;
  }
}

function requiredDescription(value: unknown, field: string, label: string): string {
  const description = requiredTrimmedString(value, field, label);
  if (!hasMeaningfulEditorContent(description)) {
    throw new CampaignCreateValidationError(`${label} is required`, field);
  }
  return description;
}

function finiteNumber(
  value: unknown,
  field: string,
  options: { defaultValue?: number; min?: number; integer?: boolean } = {},
): number {
  if (value === undefined && options.defaultValue !== undefined) {
    return options.defaultValue;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new CampaignCreateValidationError(`${field} must be a valid number`, field);
  }
  if (options.min !== undefined && numberValue < options.min) {
    throw new CampaignCreateValidationError(
      `${field} must be at least ${options.min}`,
      field,
    );
  }
  if (options.integer && !Number.isInteger(numberValue)) {
    throw new CampaignCreateValidationError(`${field} must be an integer`, field);
  }
  return numberValue;
}

function optionalLink(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new CampaignCreateValidationError(`${field} must be a valid URL`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) throw new Error("protocol");
    return trimmed;
  } catch {
    throw new CampaignCreateValidationError(`${field} must be a valid URL`, field);
  }
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new CampaignCreateValidationError(`${field} must be text`, field);
  const text = value.trim();
  if (text.length > maxLength) throw new CampaignCreateValidationError(`${field} exceeds ${maxLength} characters`, field);
  return text || null;
}

function imageList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new CampaignCreateValidationError("images must be an array", "images");
  }
  const images = value.map((item, index) => {
    const normalized = optionalLink(item, `images.${index}`);
    if (!normalized) {
      throw new CampaignCreateValidationError(
        `images.${index} must be a valid URL`,
        `images.${index}`,
      );
    }
    return normalized;
  });
  if (!images.length) {
    throw new CampaignCreateValidationError(
      "At least one campaign image is required",
      "images",
    );
  }
  return images;
}

function categoryIdsFromBody(body: Record<string, unknown>): string[] {
  const rawIds = Array.isArray(body.categoryIds)
    ? body.categoryIds
    : body.categoryId === undefined
      ? []
      : [body.categoryId];

  if (!rawIds.length) {
    throw new CampaignCreateValidationError(
      "At least one categoryId is required",
      "categoryIds",
    );
  }

  const invalid = rawIds.filter(
    (value) => typeof value !== "string" || !OBJECT_ID_RE.test(value),
  );
  if (invalid.length) {
    throw new CampaignCreateValidationError(
      `Invalid categoryId format: ${invalid.map(String).join(", ")}`,
      "categoryIds",
    );
  }

  return [...new Set(rawIds as string[])];
}

function translationsFromBody(body: Record<string, unknown>): ParsedCampaignTranslation[] {
  if (body.translations === undefined || body.translations === null) return [];
  if (!isRecord(body.translations)) {
    throw new CampaignCreateValidationError(
      "translations must be an object",
      "translations",
    );
  }

  const allowed = new Set<string>(CAMPAIGN_TRANSLATION_LOCALES);
  const translations: ParsedCampaignTranslation[] = [];

  for (const [locale, rawTranslation] of Object.entries(body.translations)) {
    if (!allowed.has(locale)) {
      throw new CampaignCreateValidationError(
        `Unsupported translation locale: ${locale}`,
        `translations.${locale}`,
      );
    }
    if (!isRecord(rawTranslation)) {
      throw new CampaignCreateValidationError(
        `translations.${locale} must be an object`,
        `translations.${locale}`,
      );
    }

    const rawTitle = rawTranslation.title;
    const rawDescription = rawTranslation.description;
    const image = optionalLink(rawTranslation.image, `translations.${locale}.image`);
    const videoUrl = optionalLink(
      rawTranslation.videoUrl,
      `translations.${locale}.videoUrl`,
    );
    const seoTitle = optionalText(rawTranslation.seoTitle, `translations.${locale}.seoTitle`, 160);
    const seoDescription = optionalText(rawTranslation.seoDescription, `translations.${locale}.seoDescription`, 220);
    const seoKeyword = optionalText(rawTranslation.seoKeyword, `translations.${locale}.seoKeyword`, 500);
    const ogTitle = optionalText(rawTranslation.ogTitle, `translations.${locale}.ogTitle`, 180);
    const ogDescription = optionalText(rawTranslation.ogDescription, `translations.${locale}.ogDescription`, 300);
    const ogImage = optionalLink(rawTranslation.ogImage, `translations.${locale}.ogImage`);
    const rawNoIndex = optionalText(rawTranslation.seoNoIndex, `translations.${locale}.seoNoIndex`, 5);
    if (rawNoIndex !== null && rawNoIndex !== "true" && rawNoIndex !== "false") {
      throw new CampaignCreateValidationError(`translations.${locale}.seoNoIndex must be true or false`, `translations.${locale}.seoNoIndex`);
    }
    let faqContent: string | null;
    try {
      faqContent = parseCampaignFaqContent(rawTranslation.faqContent);
    } catch (error) {
      throw new CampaignCreateValidationError(
        error instanceof Error ? error.message : `translations.${locale}.faqContent is invalid`,
        `translations.${locale}.faqContent`,
      );
    }
    const hasTitle = typeof rawTitle === "string" && Boolean(rawTitle.trim());
    const hasDescription =
      typeof rawDescription === "string" &&
      hasMeaningfulEditorContent(rawDescription);
    const explicitSlug =
      typeof rawTranslation.slug === "string" && rawTranslation.slug.trim()
        ? rawTranslation.slug.trim()
        : null;
    const hasAnyValue = hasTitle || hasDescription || Boolean(image) || Boolean(videoUrl) || Boolean(explicitSlug) || Boolean(seoTitle) || Boolean(seoDescription) || Boolean(seoKeyword) || Boolean(ogTitle) || Boolean(ogDescription) || Boolean(ogImage) || Boolean(faqContent) || rawNoIndex === "true";

    if (!hasAnyValue) continue;
    if (!hasTitle || !hasDescription) {
      throw new CampaignCreateValidationError(
        `translations.${locale} requires both title and description`,
        `translations.${locale}`,
      );
    }

    const title = requiredTrimmedString(
      rawTitle,
      `translations.${locale}.title`,
      `translations.${locale}.title`,
    );
    const description = requiredDescription(
      rawDescription,
      `translations.${locale}.description`,
      `translations.${locale}.description`,
    );
    translations.push({
      locale: locale as CampaignTranslationLocale,
      title,
      description,
      image,
      videoUrl,
      seoTitle,
      seoDescription,
      seoKeyword,
      ogTitle,
      ogDescription,
      ogImage,
      seoNoIndex: rawNoIndex,
      faqContent,
      slugBase: explicitSlug || title,
    });
  }

  return translations;
}

export function parseCampaignCreatePayload(
  rawBody: unknown,
  extras: CampaignCreateExtras,
): ParsedCampaignCreatePayload {
  if (!isRecord(rawBody)) {
    throw new CampaignCreateValidationError("Request body must be an object");
  }

  const title = requiredTrimmedString(rawBody.title, "title", "Arabic title");
  const description = requiredDescription(
    rawBody.description,
    "description",
    "Arabic description",
  );

  const goalType = rawBody.goalType === undefined ? "FIXED" : rawBody.goalType;
  if (goalType !== "FIXED" && goalType !== "OPEN") {
    throw new CampaignCreateValidationError("Invalid goalType", "goalType");
  }

  const fundraisingMode =
    rawBody.fundraisingMode === undefined ? "AMOUNT" : rawBody.fundraisingMode;
  if (fundraisingMode !== "AMOUNT" && fundraisingMode !== "SHARES") {
    throw new CampaignCreateValidationError(
      "Invalid fundraisingMode",
      "fundraisingMode",
    );
  }

  const targetAmount =
    goalType === "OPEN"
      ? 0
      : finiteNumber(rawBody.targetAmount, "targetAmount", { min: 1 });
  const currentAmount = finiteNumber(rawBody.currentAmount, "currentAmount", {
    defaultValue: 0,
    min: 0,
  });
  const sharePriceUSD =
    fundraisingMode === "SHARES"
      ? finiteNumber(rawBody.sharePriceUSD, "sharePriceUSD", { min: 0.01 })
      : null;

  let priority: number | null = null;
  if (rawBody.priority !== undefined && rawBody.priority !== null && rawBody.priority !== "") {
    priority = finiteNumber(rawBody.priority, "priority", {
      min: 0,
      integer: true,
    });
  }

  if (rawBody.isActive !== undefined && typeof rawBody.isActive !== "boolean") {
    throw new CampaignCreateValidationError(
      "isActive must be a boolean",
      "isActive",
    );
  }

  const explicitSlug =
    typeof rawBody.slug === "string" && rawBody.slug.trim()
      ? rawBody.slug.trim()
      : null;
  const seoTitle = optionalText(rawBody.seoTitle, "seoTitle", 160);
  const seoDescription = optionalText(rawBody.seoDescription, "seoDescription", 220);
  const seoKeyword = optionalText(rawBody.seoKeyword, "seoKeyword", 500);
  const ogTitle = optionalText(rawBody.ogTitle, "ogTitle", 180);
  const ogDescription = optionalText(rawBody.ogDescription, "ogDescription", 300);
  const ogImage = optionalLink(rawBody.ogImage, "ogImage");
  const rawNoIndex = optionalText(rawBody.seoNoIndex, "seoNoIndex", 5);
  if (rawNoIndex !== null && rawNoIndex !== "true" && rawNoIndex !== "false") {
    throw new CampaignCreateValidationError("seoNoIndex must be true or false", "seoNoIndex");
  }
  let faqContent: string | null;
  try {
    faqContent = parseCampaignFaqContent(rawBody.faqContent);
  } catch (error) {
    throw new CampaignCreateValidationError(
      error instanceof Error ? error.message : "faqContent is invalid",
      "faqContent",
    );
  }

  return {
    title,
    description,
    targetAmount,
    currentAmount,
    images: imageList(rawBody.images),
    videoUrl: optionalLink(rawBody.videoUrl, "videoUrl"),
    isActive: rawBody.isActive ?? true,
    priority,
    goalType,
    fundraisingMode,
    sharePriceUSD,
    categoryIds: categoryIdsFromBody(rawBody),
    slugBase: explicitSlug || title,
    seoTitle,
    seoDescription,
    seoKeyword,
    ogTitle,
    ogDescription,
    ogImage,
    seoNoIndex: rawNoIndex,
    faqContent,
    translations: translationsFromBody(rawBody),
    ...extras,
  };
}

export function createCampaignCreator(dependencies: CampaignCreateDependencies) {
  return async function createCampaign(
    input: ParsedCampaignCreatePayload,
  ): Promise<unknown> {
    return dependencies.transaction(async (tx) => {
      const categories = await tx.findCategories(input.categoryIds);
      const foundIds = new Set(categories.map((category) => category.id));
      const missingIds = input.categoryIds.filter((id) => !foundIds.has(id));
      if (missingIds.length) {
        throw new CampaignCreateValidationError(
          `Invalid categoryId(s): ${missingIds.join(", ")}`,
          "categoryIds",
        );
      }

      const inactiveIds = categories
        .filter((category) => category.isActive === false)
        .map((category) => category.id);
      if (inactiveIds.length) {
        throw new CampaignCreateValidationError(
          `Inactive categoryId(s): ${inactiveIds.join(", ")}`,
          "categoryIds",
        );
      }

      const slug = await tx.generateCampaignSlug(input.slugBase);
      if (!slug.trim()) {
        throw new CampaignCreateValidationError(
          "Unable to generate a campaign slug",
          "slug",
        );
      }

      const campaign = await tx.createCampaign({
        title: input.title,
        description: input.description,
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        images: input.images,
        videoUrl: input.videoUrl,
        isActive: input.isActive,
        priority: input.priority,
        categoryIds: input.categoryIds,
        categoryPriorities: input.categoryPriorities,
        suggestedDonations: input.suggestedDonations,
        suggestedTeamSupport: input.suggestedTeamSupport,
        goalType: input.goalType,
        fundraisingMode: input.fundraisingMode,
        sharePriceUSD: input.sharePriceUSD,
        suggestedShareCounts: input.suggestedShareCounts,
        shareLabels: input.shareLabels,
        slug,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        seoKeyword: input.seoKeyword,
        ogTitle: input.ogTitle,
        ogDescription: input.ogDescription,
        ogImage: input.ogImage,
        seoNoIndex: input.seoNoIndex,
        faqContent: input.faqContent,
      });

      for (const translation of input.translations) {
        const translationSlug = await tx.generateTranslationSlug(
          translation.locale,
          translation.slugBase,
        );
        await tx.createTranslation({
          campaignId: campaign.id,
          locale: translation.locale,
          title: translation.title,
          description: translation.description,
          image: translation.image,
          videoUrl: translation.videoUrl,
          slug: translationSlug,
          seoTitle: translation.seoTitle,
          seoDescription: translation.seoDescription,
          seoKeyword: translation.seoKeyword,
          ogTitle: translation.ogTitle,
          ogDescription: translation.ogDescription,
          ogImage: translation.ogImage,
          seoNoIndex: translation.seoNoIndex,
          faqContent: translation.faqContent,
        });
      }

      return tx.getCreatedCampaign(campaign.id);
    });
  };
}
