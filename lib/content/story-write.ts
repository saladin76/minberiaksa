/**
 * Shaping for the story-rail write endpoints.
 *
 * Follows `lib/slides/slide-write.ts` for the parent row: a select shared by
 * every read that follows a write, full scalars for create, and a patch for
 * update so an omitted field means "leave it alone" rather than "reset it".
 *
 * Slides are the part that is different. They are not edited one at a time —
 * the form posts the whole list and the route replaces it (`deleteMany` then
 * `create` inside the parent's nested write), so a save is one atomic
 * operation and the stored list is exactly what the editor last saw.
 */

import {
  boolDefaultTrue,
  intOr,
  optionalDate,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";
import { isStoryCtaKind, isStoryPageTarget, type StoryCtaKindValue } from "./story-cta";
import { isKnownLocale } from "@/lib/locales";

export const STORY_MEDIA_TYPES = ["IMAGE", "VIDEO"] as const;
export type StoryMediaTypeValue = (typeof STORY_MEDIA_TYPES)[number];

export function isStoryMediaType(v: unknown): v is StoryMediaTypeValue {
  return typeof v === "string" && (STORY_MEDIA_TYPES as readonly string[]).includes(v);
}

export const STORY_SLIDE_SELECT = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  durationSeconds: true,
  caption: true,
  ctaLabel: true,
  ctaKind: true,
  ctaValue: true,
  order: true,
  translations: { select: { locale: true, caption: true, ctaLabel: true } },
} as const;

export const STORY_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  image: true,
  order: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  translations: { select: { locale: true, title: true } },
  slides: { orderBy: { order: "asc" as const }, select: STORY_SLIDE_SELECT },
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

/* ── Slides ──────────────────────────────────────────────────────────────── */

/** Bounds for an IMAGE slide's dwell time. Instagram uses 5s; 60s is generous. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 60;
const DEFAULT_SECONDS = 5;

export interface StorySlideTranslationInput {
  locale: string;
  caption?: string;
  ctaLabel?: string;
}

export interface StorySlideInput {
  mediaType: StoryMediaTypeValue;
  mediaUrl: string;
  durationSeconds: number;
  caption?: string;
  ctaLabel?: string;
  ctaKind?: StoryCtaKindValue;
  ctaValue?: string;
  order: number;
  translations: StorySlideTranslationInput[];
}

/**
 * Slide translations do not fit `parseTranslations`, whose model is "one
 * required field decides presence". A slide may carry only a caption, or only
 * a button label, and either alone is worth translating — so a locale counts
 * as present when EITHER field has text.
 */
function parseSlideTranslations(raw: unknown): StorySlideTranslationInput[] {
  if (!raw || typeof raw !== "object") return [];
  const out: StorySlideTranslationInput[] = [];
  for (const [locale, v] of Object.entries(raw as Record<string, unknown>)) {
    if (locale === "ar" || !isKnownLocale(locale) || !v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    const caption = optionalStr(t.caption);
    const ctaLabel = optionalStr(t.ctaLabel);
    if (!caption && !ctaLabel) continue;
    out.push({ locale, caption, ctaLabel });
  }
  return out;
}

/**
 * The CTA half of a slide. Both parts must agree or there is no CTA: a kind
 * with no value, a value with no kind, or a PAGE key that is not a linkable
 * page all collapse to "no button" rather than to a broken one.
 */
function parseCta(v: Record<string, unknown>): { ctaKind?: StoryCtaKindValue; ctaValue?: string } {
  const kind = isStoryCtaKind(v.ctaKind) ? v.ctaKind : undefined;
  const value = optionalStr(v.ctaValue);
  if (!kind || !value) return {};
  if (kind === "PAGE" && !isStoryPageTarget(value)) return {};
  return { ctaKind: kind, ctaValue: value };
}

/**
 * Slides as posted by the form. Rows without media are dropped rather than
 * rejected — an empty trailing row is what an editor leaves behind after
 * clicking "add" once too often, not a mistake worth failing the save over.
 * Order is the array position, not whatever the row claims.
 */
export function parseStorySlides(raw: unknown): StorySlideInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: StorySlideInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const mediaUrl = str(v.mediaUrl);
    if (!mediaUrl) continue;
    const seconds = intOr(v.durationSeconds, DEFAULT_SECONDS);
    out.push({
      mediaType: isStoryMediaType(v.mediaType) ? v.mediaType : "IMAGE",
      mediaUrl,
      durationSeconds: Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds)),
      caption: optionalStr(v.caption),
      ctaLabel: optionalStr(v.ctaLabel),
      ...parseCta(v),
      order: out.length,
      translations: parseSlideTranslations(v.translations),
    });
  }
  return out;
}

/**
 * The nested `create` payload for a slide list, translations included. Used by
 * both the create route and the replace-on-update path so the two cannot
 * disagree about shape.
 */
export function slidesCreateData(slides: StorySlideInput[]) {
  return slides.map(({ translations, ...scalars }) => ({
    ...scalars,
    ...(translations.length ? { translations: { create: translations } } : {}),
  }));
}
