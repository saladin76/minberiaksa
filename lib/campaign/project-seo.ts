export type ProjectSeoFields = {
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
};

export const PROJECT_SEO_FIELD_KEYS = [
  'seoTitle',
  'seoDescription',
  'ogTitle',
  'ogDescription',
  'ogImage',
] as const;

export type ProjectSeoFieldKey = (typeof PROJECT_SEO_FIELD_KEYS)[number];

export const normalizeSeoText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const normalizeSeoFields = (input: unknown): ProjectSeoFields => {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    seoTitle: normalizeSeoText(source.seoTitle),
    seoDescription: normalizeSeoText(source.seoDescription),
    ogTitle: normalizeSeoText(source.ogTitle),
    ogDescription: normalizeSeoText(source.ogDescription),
    ogImage: normalizeSeoText(source.ogImage),
  };
};

export const compactSeoFields = (fields: ProjectSeoFields) =>
  Object.fromEntries(
    PROJECT_SEO_FIELD_KEYS.map((key) => [key, fields[key] ?? null]),
  ) as ProjectSeoFields;

export const buildSeoFallback = ({
  localeFields,
  localeTitle,
  localeDescription,
  localeImage,
  campaignFields,
  campaignTitle,
  campaignDescription,
  campaignImage,
}: {
  localeFields?: ProjectSeoFields | null;
  localeTitle?: string | null;
  localeDescription?: string | null;
  localeImage?: string | null;
  campaignFields?: ProjectSeoFields | null;
  campaignTitle?: string | null;
  campaignDescription?: string | null;
  campaignImage?: string | null;
}): ProjectSeoFields => ({
  seoTitle: localeFields?.seoTitle || localeTitle || campaignFields?.seoTitle || campaignTitle || null,
  seoDescription:
    localeFields?.seoDescription ||
    localeDescription ||
    campaignFields?.seoDescription ||
    campaignDescription ||
    null,
  ogTitle: localeFields?.ogTitle || localeFields?.seoTitle || localeTitle || campaignFields?.ogTitle || campaignTitle || null,
  ogDescription:
    localeFields?.ogDescription ||
    localeFields?.seoDescription ||
    localeDescription ||
    campaignFields?.ogDescription ||
    campaignDescription ||
    null,
  ogImage: localeFields?.ogImage || localeImage || campaignFields?.ogImage || campaignImage || null,
});
