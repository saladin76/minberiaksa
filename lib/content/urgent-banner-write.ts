/**
 * Shaping for the banner write endpoints.
 *
 * Follows `story-write.ts` closely — a banner is a story with more fields and
 * the same scheduling window — with one difference in the default: a story
 * assumes 24 hours, a banner assumes nothing. An appeal runs until someone
 * decides it is over, and inventing an end date for it would silently pull a
 * live appeal down.
 *
 * Beyond the story shape a banner carries WHERE it shows (`placements`, from
 * the catalogue in `lib/minbar/banner-placements.ts`), HOW it looks (`tone`,
 * `textSide`), price chips (`suggestedAmounts` + `amountLabels`, same order),
 * a kicker strip and a second button. Its order is `priority`, ascending, set
 * by drag-and-drop on the list — never typed.
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
import { isBannerTextSide, isBannerTone, parsePlacements } from "@/lib/minbar/banner-placements";

export const URGENT_BANNER_WITH_TRANSLATIONS_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  kicker: true,
  image: true,
  ctaLabel: true,
  ctaUrl: true,
  ctaSecondaryLabel: true,
  ctaSecondaryUrl: true,
  campaignId: true,
  suggestedAmounts: true,
  amountLabels: true,
  placements: true,
  tone: true,
  textSide: true,
  priority: true,
  locales: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  translations: {
    select: { locale: true, title: true, description: true, ctaLabel: true, kicker: true, ctaSecondaryLabel: true, amountLabels: true },
  },
} as const;

/** A comma/newline separated list, or an array — trimmed, empties dropped. */
export function labelList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,،\n]+/) : [];
  return parts.map((x) => str(x)).filter(Boolean);
}

export interface BannerTranslationRow {
  locale: string;
  title: string;
  description: string;
  ctaLabel: string;
  kicker: string;
  ctaSecondaryLabel: string;
  amountLabels: string[];
}

/**
 * The string fields go through the shared parser; the one list field is read
 * beside it from the same raw map, since the parser only knows strings.
 */
export function parseUrgentBannerTranslations(translations: unknown): { write: BannerTranslationRow[]; clear: string[] } {
  const { write, clear } = parseTranslations(translations, {
    required: "title",
    optional: ["description", "ctaLabel", "kicker", "ctaSecondaryLabel"],
  });
  const raw = (translations && typeof translations === "object" ? translations : {}) as Record<string, Record<string, unknown>>;
  return {
    write: write.map((row) => ({ ...row, amountLabels: labelList(raw[row.locale]?.amountLabels) })),
    clear,
  };
}

/** A Mongo ObjectId is 24 hex characters; anything else is not a campaign id. */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function campaignId(v: unknown): string | undefined {
  const s = str(v);
  return OBJECT_ID.test(s) ? s : undefined;
}

/**
 * Price chips. Accepts an array or a comma/space separated string and keeps
 * positive integers in the order typed — the labels beside them are
 * positional, so the order must survive.
 */
function amounts(v: unknown): number[] {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,،]+/) : [];
  const out: number[] = [];
  for (const raw of parts) {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 4);
}

function tone(v: unknown): string {
  return isBannerTone(v) ? v : "red";
}
function textSide(v: unknown): string {
  return isBannerTextSide(v) ? v : "start";
}

export function buildUrgentBannerScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    description: optionalStr(body.description),
    kicker: optionalStr(body.kicker),
    image: optionalStr(body.image),
    ctaLabel: optionalStr(body.ctaLabel),
    ctaUrl: optionalStr(body.ctaUrl),
    ctaSecondaryLabel: optionalStr(body.ctaSecondaryLabel),
    ctaSecondaryUrl: optionalStr(body.ctaSecondaryUrl),
    campaignId: campaignId(body.campaignId),
    suggestedAmounts: amounts(body.suggestedAmounts),
    amountLabels: labelList(body.amountLabels),
    placements: parsePlacements(body.placements),
    tone: tone(body.tone),
    textSide: textSide(body.textSide),
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
  if (body.kicker !== undefined) patch.kicker = optionalStr(body.kicker) ?? null;
  if (body.image !== undefined) patch.image = optionalStr(body.image) ?? null;
  if (body.ctaLabel !== undefined) patch.ctaLabel = optionalStr(body.ctaLabel) ?? null;
  if (body.ctaUrl !== undefined) patch.ctaUrl = optionalStr(body.ctaUrl) ?? null;
  if (body.ctaSecondaryLabel !== undefined) patch.ctaSecondaryLabel = optionalStr(body.ctaSecondaryLabel) ?? null;
  if (body.ctaSecondaryUrl !== undefined) patch.ctaSecondaryUrl = optionalStr(body.ctaSecondaryUrl) ?? null;
  if (body.campaignId !== undefined) patch.campaignId = campaignId(body.campaignId) ?? null;
  if (body.suggestedAmounts !== undefined) patch.suggestedAmounts = amounts(body.suggestedAmounts);
  if (body.amountLabels !== undefined) patch.amountLabels = labelList(body.amountLabels);
  if (body.placements !== undefined) patch.placements = parsePlacements(body.placements);
  if (body.tone !== undefined) patch.tone = tone(body.tone);
  if (body.textSide !== undefined) patch.textSide = textSide(body.textSide);
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
