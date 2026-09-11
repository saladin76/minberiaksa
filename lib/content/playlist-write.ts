/**
 * Shaping for the video-playlist write endpoints ("برامجنا المصورة").
 *
 * Follows `lib/content/story-write.ts` for the parent row. The episodes are
 * different: they are not edited one at a time. The form posts the whole list,
 * and the route replaces it — `deleteMany` then `create` inside the parent's
 * nested write — so a save is one atomic operation and the stored list is
 * exactly what the editor last saw. This is also how the seed writes them,
 * which keeps the two paths from disagreeing about order.
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

export const PLAYLIST_KINDS = ["PROGRAM", "SERIES"] as const;
export type PlaylistKindValue = (typeof PLAYLIST_KINDS)[number];

export function isPlaylistKind(v: unknown): v is PlaylistKindValue {
  return typeof v === "string" && (PLAYLIST_KINDS as readonly string[]).includes(v);
}

export const PLAYLIST_WITH_CHILDREN_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  youtubePlaylistUrl: true,
  kind: true,
  coverImage: true,
  order: true,
  isActive: true,
  translations: { select: { locale: true, title: true, description: true } },
  videos: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      youtubeId: true,
      url: true,
      thumbnail: true,
      title: true,
      durationSeconds: true,
      order: true,
      isActive: true,
    },
  },
} as const;

export function parsePlaylistTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "title", optional: ["description"] });
}

export function buildPlaylistScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    description: optionalStr(body.description),
    youtubePlaylistUrl: optionalStr(body.youtubePlaylistUrl),
    kind: (isPlaylistKind(body.kind) ? body.kind : "PROGRAM") as PlaylistKindValue,
    coverImage: optionalStr(body.coverImage),
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildPlaylistScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.description !== undefined) patch.description = optionalStr(body.description) ?? null;
  if (body.youtubePlaylistUrl !== undefined) patch.youtubePlaylistUrl = optionalStr(body.youtubePlaylistUrl) ?? null;
  if (body.kind !== undefined && isPlaylistKind(body.kind)) patch.kind = body.kind;
  if (body.coverImage !== undefined) patch.coverImage = optionalStr(body.coverImage) ?? null;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

export interface PlaylistVideoInput {
  youtubeId: string;
  url: string;
  thumbnail?: string;
  title?: string;
  durationSeconds?: number;
  order: number;
  isActive: boolean;
}

/**
 * Episodes as posted by the form. Rows without a YouTube id are dropped rather
 * than rejected: an empty trailing row is what an editor leaves behind after
 * clicking "add" once too often, not a mistake worth failing the save over.
 * Order is the array position, not whatever the row claims.
 */
export function parsePlaylistVideos(raw: unknown): PlaylistVideoInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: PlaylistVideoInput[] = [];
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
      durationSeconds: optionalInt(v.durationSeconds),
      order: out.length,
      isActive: boolDefaultTrue(v.isActive),
    });
  }
  return out;
}
