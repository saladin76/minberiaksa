/**
 * Shaping for the two document sections — reports ("التقارير") and booklets
 * ("كتيبات المؤسسة").
 *
 * They share a module because they are the same row with one difference: a
 * report carries a publication `year`. They do NOT share routes or a select —
 * `translation-write.ts` explains why the nested translation writes stay
 * spelled out per model with concrete field names.
 */

import {
  boolDefaultTrue,
  intOr,
  optionalInt,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";

export const REPORT_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  fileUrl: true,
  coverImage: true,
  year: true,
  order: true,
  isPublished: true,
  translations: { select: { locale: true, title: true, description: true } },
} as const;

export const BOOKLET_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  author: true,
  fileUrl: true,
  coverImage: true,
  order: true,
  isPublished: true,
  translations: { select: { locale: true, title: true, description: true } },
} as const;

/**
 * Both translate a title and a description. The title is what decides whether a
 * locale has content at all: a description with no title is not a translation.
 */
export function parseDocumentTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "title", optional: ["description"] });
}

/** Fields common to both models. */
function buildSharedScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    description: optionalStr(body.description),
    fileUrl: str(body.fileUrl),
    coverImage: optionalStr(body.coverImage),
    order: intOr(body.order, 0),
    isPublished: boolDefaultTrue(body.isPublished),
  };
}

function buildSharedPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.description !== undefined) patch.description = optionalStr(body.description) ?? null;
  if (body.fileUrl !== undefined) patch.fileUrl = str(body.fileUrl);
  if (body.coverImage !== undefined) patch.coverImage = optionalStr(body.coverImage) ?? null;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isPublished !== undefined) patch.isPublished = boolDefaultTrue(body.isPublished);
  return patch;
}

export function buildReportScalars(body: Record<string, unknown>) {
  return { ...buildSharedScalars(body), year: optionalInt(body.year) };
}

export function buildReportScalarPatch(body: Record<string, unknown>) {
  const patch = buildSharedPatch(body);
  if (body.year !== undefined) patch.year = optionalInt(body.year) ?? null;
  return patch;
}

export function buildBookletScalars(body: Record<string, unknown>) {
  return { ...buildSharedScalars(body), author: optionalStr(body.author) };
}

export function buildBookletScalarPatch(body: Record<string, unknown>) {
  const patch = buildSharedPatch(body);
  if (body.author !== undefined) patch.author = optionalStr(body.author) ?? null;
  return patch;
}
