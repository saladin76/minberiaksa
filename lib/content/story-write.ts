/**
 * Shaping for the story-rail write endpoints.
 *
 * Follows `lib/slides/slide-write.ts`: a select shared by every read that
 * follows a write, full scalars for create, and a patch for update so an
 * omitted field means "leave it alone" rather than "reset it".
 */

import {
  boolDefaultTrue,
  intOr,
  optionalDate,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";

export const STORY_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  image: true,
  linkUrl: true,
  order: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  translations: { select: { locale: true, title: true } },
} as const;

/** Stories translate one field, so a locale with no title is a cleared locale. */
export function parseStoryTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "title" });
}

/**
 * How long a new story runs when the editor does not say.
 *
 * A story rail is a daily format, so 24 hours is the sensible default — but it
 * cannot be a Prisma default, which must be static. The dashboard's "unlimited"
 * option posts `endsAt: null` explicitly and reaches `optionalDate` as null,
 * which is why "absent" and "explicitly empty" are kept distinct all the way
 * down: only the former gets the 24-hour window.
 */
export const STORY_DEFAULT_HOURS = 24;

export function buildStoryScalars(body: Record<string, unknown>) {
  const startsAt = optionalDate(body.startsAt) ?? null;

  /* `endsAt` absent → default window. `endsAt` present but empty → the editor
     chose unlimited, so it stays null. */
  const endsAt =
    body.endsAt === undefined
      ? new Date((startsAt ?? new Date()).getTime() + STORY_DEFAULT_HOURS * 3600_000)
      : (optionalDate(body.endsAt) ?? null);

  return {
    slug: str(body.slug),
    title: str(body.title),
    image: str(body.image),
    linkUrl: optionalStr(body.linkUrl),
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
    startsAt,
    endsAt,
  };
}

export function buildStoryScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.image !== undefined) patch.image = str(body.image);
  if (body.linkUrl !== undefined) patch.linkUrl = optionalStr(body.linkUrl) ?? null;
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  if (body.startsAt !== undefined) patch.startsAt = optionalDate(body.startsAt) ?? null;
  if (body.endsAt !== undefined) patch.endsAt = optionalDate(body.endsAt) ?? null;
  return patch;
}

/**
 * A story is live when it is active and `now` sits inside its window. A null
 * bound is open-ended, which is how "unlimited" is stored.
 */
export function storyLiveWhere(now = new Date()) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}
