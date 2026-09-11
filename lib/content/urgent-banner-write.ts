/**
 * Shaping for the urgent-banner write endpoints.
 *
 * Follows `story-write.ts` closely — a banner is a story with more fields and
 * the same scheduling window — with one difference in the default: a story
 * assumes 24 hours, a banner assumes nothing. An emergency appeal runs until
 * someone decides it is over, and inventing an end date for it would silently
 * pull a live appeal down.
 */

import {
  boolDefaultTrue,
  intOr,
  localeList,
  optionalDate,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";

export const URGENT_BANNER_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  image: true,
  ctaLabel: true,
  ctaUrl: true,
  campaignId: true,
  suggestedAmounts: true,
  priority: true,
  locales: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  translations: { select: { locale: true, title: true, description: true, ctaLabel: true } },
} as const;

export function parseUrgentBannerTranslations(translations: unknown) {
  return parseTranslations(translations, {
    required: "title",
    optional: ["description", "ctaLabel"],
  });
}

/** A Mongo ObjectId is 24 hex characters; anything else is not a campaign id. */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function campaignId(v: unknown): string | undefined {
  const s = str(v);
  return OBJECT_ID.test(s) ? s : undefined;
}

/**
 * Quick-pick amounts. Accepts an array or a comma/space separated string,
 * keeps positive integers, de-duplicates and sorts ascending so the buttons
 * read left-to-right small-to-large regardless of how they were typed.
 */
function amounts(v: unknown): number[] {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,،]+/) : [];
  const out = new Set<number>();
  for (const raw of parts) {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function buildUrgentBannerScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    description: optionalStr(body.description),
    image: optionalStr(body.image),
    ctaLabel: optionalStr(body.ctaLabel),
    ctaUrl: optionalStr(body.ctaUrl),
    campaignId: campaignId(body.campaignId),
    suggestedAmounts: amounts(body.suggestedAmounts),
    priority: intOr(body.priority, 0),
    locales: localeList(body.locales),
    startsAt: optionalDate(body.startsAt) ?? null,
    endsAt: optionalDate(body.endsAt) ?? null,
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildUrgentBannerScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  if (body.description !== undefined) patch.description = optionalStr(body.description) ?? null;
  if (body.image !== undefined) patch.image = optionalStr(body.image) ?? null;
  if (body.ctaLabel !== undefined) patch.ctaLabel = optionalStr(body.ctaLabel) ?? null;
  if (body.ctaUrl !== undefined) patch.ctaUrl = optionalStr(body.ctaUrl) ?? null;
  if (body.campaignId !== undefined) patch.campaignId = campaignId(body.campaignId) ?? null;
  if (body.suggestedAmounts !== undefined) patch.suggestedAmounts = amounts(body.suggestedAmounts);
  if (body.priority !== undefined) patch.priority = intOr(body.priority, 0);
  if (body.locales !== undefined) patch.locales = localeList(body.locales);
  if (body.startsAt !== undefined) patch.startsAt = optionalDate(body.startsAt) ?? null;
  if (body.endsAt !== undefined) patch.endsAt = optionalDate(body.endsAt) ?? null;
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

/** Live for one locale: active, inside its window, and allowed for the locale. */
export function urgentBannerLiveWhere(locale: string, now = new Date()) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      { OR: [{ locales: { isEmpty: true } }, { locales: { has: locale } }] },
    ],
  };
}
