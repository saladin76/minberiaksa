/**
 * Shaping for the course write endpoints ("دوراتنا").
 *
 * Same shape as `playlist-write.ts`: a parent row edited as a patch, and a
 * child video list the form posts whole and the route replaces atomically.
 *
 * The three course shapes the schema describes — detail page, intro-only,
 * external — are flags on the row, so the form does not need modes; it shows
 * the fields and the site decides how to render the result.
 */

import {
  boolDefaultTrue,
  intOr,
  optionalInt,
  optionalStr,
  parseTranslations,
  str,
  youtubeId as parseYoutubeId,
} from "./translation-write";

export const COURSE_KINDS = ["COURSE", "SEMINAR"] as const;
export type CourseKindValue = (typeof COURSE_KINDS)[number];
export function isCourseKind(v: unknown): v is CourseKindValue {
  return typeof v === "string" && (COURSE_KINDS as readonly string[]).includes(v);
}

export const COURSE_WITH_CHILDREN_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  kind: true,
  coverImage: true,
  introVideoId: true,
  introVideoUrl: true,
  unitsCount: true,
  isPinned: true,
  isExternal: true,
  externalUrl: true,
  hasDetailPage: true,
  order: true,
  isActive: true,
  translations: { select: { locale: true, title: true, description: true } },
  videos: {
    orderBy: { order: "asc" as const },
    select: { id: true, youtubeId: true, url: true, thumbnail: true, title: true, order: true },
  },
} as const;

export function parseCourseTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "title", optional: ["description"] });
}

export function buildCourseScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    description: optionalStr(body.description),
    kind: (isCourseKind(body.kind) ? body.kind : "COURSE") as CourseKindValue,
    coverImage: optionalStr(body.coverImage),
    introVideoId: optionalStr(body.introVideoId),
    introVideoUrl: optionalStr(body.introVideoUrl),
    unitsCount: optionalInt(body.unitsCount),
    isPinned: body.isPinned === true,
    isExternal: body.isExternal === true,
    externalUrl: optionalStr(body.externalUrl),
    hasDetailPage: body.hasDetailPage === true,
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildCourseScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.description !== undefined) patch.description = optionalStr(body.description) ?? null;
  if (body.kind !== undefined && isCourseKind(body.kind)) patch.kind = body.kind;
  if (body.coverImage !== undefined) patch.coverImage = optionalStr(body.coverImage) ?? null;
  if (body.introVideoId !== undefined) patch.introVideoId = optionalStr(body.introVideoId) ?? null;
  if (body.introVideoUrl !== undefined) patch.introVideoUrl = optionalStr(body.introVideoUrl) ?? null;
  if (body.unitsCount !== undefined) patch.unitsCount = optionalInt(body.unitsCount) ?? null;
  if (body.isPinned !== undefined) patch.isPinned = body.isPinned === true;
  if (body.isExternal !== undefined) patch.isExternal = body.isExternal === true;
  if (body.externalUrl !== undefined) patch.externalUrl = optionalStr(body.externalUrl) ?? null;
  if (body.hasDetailPage !== undefined) patch.hasDetailPage = body.hasDetailPage === true;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

export interface CourseVideoInput {
  youtubeId: string;
  url: string;
  thumbnail?: string;
  title?: string;
  order: number;
}

/** See `parsePlaylistVideos` — same rules, minus the per-episode active flag. */
export function parseCourseVideos(raw: unknown): CourseVideoInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: CourseVideoInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const youtubeId = parseYoutubeId(v.youtubeId);
    if (!youtubeId) continue;
    out.push({
      youtubeId,
      url: str(v.url) || `https://www.youtube.com/watch?v=${youtubeId}`,
      thumbnail: optionalStr(v.thumbnail),
      title: optionalStr(v.title),
      order: out.length,
    });
  }
  return out;
}
