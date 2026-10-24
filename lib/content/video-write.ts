/**
 * Shaping for the standalone-video write endpoints.
 *
 * Follows `lib/content/story-write.ts`: one select shared by every read that
 * follows a write, full scalars for create, and a patch for update so an
 * omitted field means "leave it alone" rather than "reset it".
 */

import {
  boolDefaultTrue,
  intOr,
  localeList,
  optionalInt,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";
import { normalizeVideoSource } from "./video-platform";

export const VIDEO_TYPES = ["ACHIEVEMENT", "ENDORSEMENT", "FIELD", "EVENT"] as const;
export type VideoTypeValue = (typeof VIDEO_TYPES)[number];

export function isVideoType(v: unknown): v is VideoTypeValue {
  return typeof v === "string" && (VIDEO_TYPES as readonly string[]).includes(v);
}

export const VIDEO_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  type: true,
  title: true,
  youtubeId: true,
  url: true,
  startSeconds: true,
  thumbnail: true,
  regionKey: true,
  localeFilter: true,
  showOnHome: true,
  order: true,
  isActive: true,
  translations: { select: { locale: true, title: true } },
} as const;

/** Videos translate one field, so a locale with no title is a cleared locale. */
export function parseVideoTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "title" });
}

export function buildVideoScalars(body: Record<string, unknown>) {
  const startSeconds = optionalInt(body.startSeconds);
  const source = normalizeVideoSource({
    mediaUrl: body.mediaUrl,
    youtubeId: body.youtubeId,
    url: body.url,
    startSeconds,
  });
  return {
    slug: str(body.slug),
    type: (isVideoType(body.type) ? body.type : "ACHIEVEMENT") as VideoTypeValue,
    title: str(body.title),
    youtubeId: source.youtubeId,
    url: source.url,
    startSeconds,
    thumbnail: optionalStr(body.thumbnail),
    regionKey: optionalStr(body.regionKey),
    localeFilter: localeList(body.localeFilter),
    showOnHome: body.showOnHome === true,
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildVideoScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.mediaUrl !== undefined || body.youtubeId !== undefined || body.url !== undefined) {
    const source = normalizeVideoSource({
      mediaUrl: body.mediaUrl,
      youtubeId: body.youtubeId,
      url: body.url,
      startSeconds: body.startSeconds === undefined ? null : optionalInt(body.startSeconds),
    });
    patch.youtubeId = source.youtubeId;
    patch.url = source.url;
  }
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.type !== undefined && isVideoType(body.type)) patch.type = body.type;
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.startSeconds !== undefined) patch.startSeconds = optionalInt(body.startSeconds) ?? null;
  if (body.thumbnail !== undefined) patch.thumbnail = optionalStr(body.thumbnail) ?? null;
  if (body.regionKey !== undefined) patch.regionKey = optionalStr(body.regionKey) ?? null;
  if (body.localeFilter !== undefined) patch.localeFilter = localeList(body.localeFilter);
  if (body.showOnHome !== undefined) patch.showOnHome = body.showOnHome === true;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

/**
 * Public visibility for one locale.
 *
 * `localeFilter` is an allow-list and empty means "every locale"  the Turkish
 * endorsements are the reason it exists, and they must not surface elsewhere.
 */
export function videoLiveWhere(locale: string, type?: VideoTypeValue) {
  return {
    isActive: true,
    ...(type ? { type } : {}),
    OR: [{ localeFilter: { isEmpty: true } }, { localeFilter: { has: locale } }],
  };
}
