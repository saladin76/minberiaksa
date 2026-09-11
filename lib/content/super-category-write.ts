/**
 * Shaping for the super-category write endpoints ("الأقسام الكبرى").
 *
 * A super category is a themed landing page — hero, verse, accent colour, calls
 * to action — plus two child lists the form posts whole and the route replaces
 * wholesale, the way `lib/content/playlist-write.ts` handles episodes:
 *
 *   · `items`  — pointers to campaigns, articles, videos, playlists, courses,
 *                reports and booklets, ordered per kind.
 *   · `blocks` — the page's sections, each with its own translations.
 *
 * Replacing rather than diffing is what makes a save one atomic nested write.
 * The one cost is that a block's translations are re-created with it, so a
 * block has no stable id across saves; nothing references a block by id, so
 * that is a cost worth paying for an atomic save.
 */

import {
  boolDefaultTrue,
  intOr,
  optionalInt,
  optionalStr,
  localeList,
  parseTranslations,
  str,
  youtubeId as parseYoutubeId,
} from "./translation-write";

/* ── Enums, mirrored from the schema ─────────────────────────────────────── */

export const SUPER_CATEGORY_ITEM_KINDS = [
  "CAMPAIGN",
  "POST",
  "VIDEO",
  "PLAYLIST",
  "COURSE",
  "REPORT",
  "BOOKLET",
] as const;
export type SuperCategoryItemKindValue = (typeof SUPER_CATEGORY_ITEM_KINDS)[number];

export function isItemKind(v: unknown): v is SuperCategoryItemKindValue {
  return typeof v === "string" && (SUPER_CATEGORY_ITEM_KINDS as readonly string[]).includes(v);
}

export const SUPER_CATEGORY_BLOCK_KINDS = [
  "CAMPAIGNS",
  "POSTS",
  "VIDEOS",
  "PLAYLISTS",
  "COURSES",
  "REPORTS",
  "BOOKLETS",
  "TEXT",
  "VIDEO",
  "PLAYLIST_EPISODES",
] as const;
export type SuperCategoryBlockKindValue = (typeof SUPER_CATEGORY_BLOCK_KINDS)[number];

export function isBlockKind(v: unknown): v is SuperCategoryBlockKindValue {
  return typeof v === "string" && (SUPER_CATEGORY_BLOCK_KINDS as readonly string[]).includes(v);
}

/** The item kind a grid block draws from, or null for the free blocks. */
export const BLOCK_SOURCE_KIND: Record<SuperCategoryBlockKindValue, SuperCategoryItemKindValue | null> = {
  CAMPAIGNS: "CAMPAIGN",
  POSTS: "POST",
  VIDEOS: "VIDEO",
  PLAYLISTS: "PLAYLIST",
  COURSES: "COURSE",
  REPORTS: "REPORT",
  BOOKLETS: "BOOKLET",
  TEXT: null,
  VIDEO: null,
  PLAYLIST_EPISODES: null,
};

/* ── Selects ─────────────────────────────────────────────────────────────── */

export const SUPER_CATEGORY_WITH_CHILDREN_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  intro: true,
  verseArabic: true,
  verseTranslation: true,
  verseAttribution: true,
  heroImage: true,
  logoImage: true,
  accentColor: true,
  heroVideoId: true,
  heroVideoLocales: true,
  ctaPrimaryLabel: true,
  ctaPrimaryHref: true,
  ctaSecondaryLabel: true,
  ctaSecondaryHref: true,
  ctaTertiaryLabel: true,
  ctaTertiaryHref: true,
  metaTitle: true,
  metaDescription: true,
  order: true,
  isActive: true,
  translations: {
    select: {
      locale: true,
      title: true,
      subtitle: true,
      intro: true,
      verseTranslation: true,
      verseAttribution: true,
      logoImage: true,
      ctaPrimaryLabel: true,
      ctaSecondaryLabel: true,
      ctaTertiaryLabel: true,
      metaTitle: true,
      metaDescription: true,
    },
  },
  items: {
    orderBy: { order: "asc" as const },
    select: { id: true, kind: true, refId: true, order: true },
  },
  blocks: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      kind: true,
      anchor: true,
      eyebrow: true,
      title: true,
      subtitle: true,
      body: true,
      linkLabel: true,
      linkUrl: true,
      image: true,
      youtubeId: true,
      refId: true,
      maxItems: true,
      order: true,
      isActive: true,
      translations: {
        select: { locale: true, eyebrow: true, title: true, subtitle: true, body: true, linkLabel: true },
      },
    },
  },
} as const;

/* ── Parent scalars ──────────────────────────────────────────────────────── */

export const SUPER_CATEGORY_TRANSLATION_FIELDS = [
  "subtitle",
  "intro",
  "verseTranslation",
  "verseAttribution",
  "logoImage",
  "ctaPrimaryLabel",
  "ctaSecondaryLabel",
  "ctaTertiaryLabel",
  "metaTitle",
  "metaDescription",
] as const;

export function parseSuperCategoryTranslations(translations: unknown) {
  return parseTranslations(translations, {
    required: "title",
    optional: SUPER_CATEGORY_TRANSLATION_FIELDS,
  });
}

export function buildSuperCategoryScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    title: str(body.title),
    subtitle: optionalStr(body.subtitle),
    intro: optionalStr(body.intro),
    verseArabic: optionalStr(body.verseArabic),
    verseTranslation: optionalStr(body.verseTranslation),
    verseAttribution: optionalStr(body.verseAttribution),
    heroImage: optionalStr(body.heroImage),
    logoImage: optionalStr(body.logoImage),
    accentColor: optionalStr(body.accentColor),
    heroVideoId: body.heroVideoId === undefined ? undefined : parseYoutubeId(body.heroVideoId) || undefined,
    heroVideoLocales: localeList(body.heroVideoLocales),
    ctaPrimaryLabel: optionalStr(body.ctaPrimaryLabel),
    ctaPrimaryHref: optionalStr(body.ctaPrimaryHref),
    ctaSecondaryLabel: optionalStr(body.ctaSecondaryLabel),
    ctaSecondaryHref: optionalStr(body.ctaSecondaryHref),
    ctaTertiaryLabel: optionalStr(body.ctaTertiaryLabel),
    ctaTertiaryHref: optionalStr(body.ctaTertiaryHref),
    metaTitle: optionalStr(body.metaTitle),
    metaDescription: optionalStr(body.metaDescription),
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

/** Only the keys the request actually carried, so a toggle touches one column. */
export function buildSuperCategoryScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const text = (key: string) => {
    if (body[key] !== undefined) patch[key] = optionalStr(body[key]) ?? null;
  };
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.title !== undefined) patch.title = str(body.title);
  for (const key of [
    "subtitle",
    "intro",
    "verseArabic",
    "verseTranslation",
    "verseAttribution",
    "heroImage",
    "logoImage",
    "accentColor",
    "ctaPrimaryLabel",
    "ctaPrimaryHref",
    "ctaSecondaryLabel",
    "ctaSecondaryHref",
    "ctaTertiaryLabel",
    "ctaTertiaryHref",
    "metaTitle",
    "metaDescription",
  ]) {
    text(key);
  }
  if (body.heroVideoId !== undefined) patch.heroVideoId = parseYoutubeId(body.heroVideoId) || null;
  if (body.heroVideoLocales !== undefined) patch.heroVideoLocales = localeList(body.heroVideoLocales);
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

/* ── Items ───────────────────────────────────────────────────────────────── */

export interface SuperCategoryItemInput {
  kind: SuperCategoryItemKindValue;
  refId: string;
  order: number;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Linked content as posted by the form: `{ CAMPAIGN: ["id", …], … }` or a flat
 * array of `{ kind, refId }`. Ids that are not ObjectIds are dropped — Prisma
 * rejects the whole write on a malformed one, so a single stale id pasted into
 * the picker would otherwise make the page unsaveable. Order is the position
 * within its own kind, and a repeated id is kept once (the schema's
 * `@@unique([superCategoryId, kind, refId])` would reject the second).
 */
export function parseSuperCategoryItems(raw: unknown): SuperCategoryItemInput[] | undefined {
  if (raw === undefined) return undefined;

  const perKind = new Map<SuperCategoryItemKindValue, string[]>();
  const push = (kind: unknown, refId: unknown) => {
    if (!isItemKind(kind)) return;
    const id = str(refId);
    if (!OBJECT_ID.test(id)) return;
    const list = perKind.get(kind) ?? [];
    if (list.includes(id)) return;
    list.push(id);
    perKind.set(kind, list);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const v = item as Record<string, unknown>;
      push(v.kind, v.refId);
    }
  } else if (raw && typeof raw === "object") {
    for (const [kind, ids] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) push(kind, id);
    }
  }

  const out: SuperCategoryItemInput[] = [];
  for (const [kind, ids] of perKind) {
    ids.forEach((refId, index) => out.push({ kind, refId, order: index }));
  }
  return out;
}

/* ── Blocks ──────────────────────────────────────────────────────────────── */

export interface SuperCategoryBlockInput {
  kind: SuperCategoryBlockKindValue;
  anchor?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  linkLabel?: string;
  linkUrl?: string;
  image?: string;
  youtubeId?: string;
  refId?: string;
  maxItems?: number;
  order: number;
  isActive: boolean;
  translations?: { create: Array<Record<string, string> & { locale: string }> };
}

export function parseSuperCategoryBlockTranslations(translations: unknown) {
  /* A block's heading may legitimately be empty (a bare video block), so the
     required field is the one that decides whether the locale says anything at
     all — any of the five. `parseTranslations` needs a single required field,
     so the rows are shaped here instead and a locale with nothing in it is
     simply not created. */
  const out: Array<Record<string, string> & { locale: string }> = [];
  if (!translations || typeof translations !== "object") return out;
  for (const [locale, raw] of Object.entries(translations as Record<string, unknown>)) {
    if (locale === "ar" || !raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const row = {
      locale,
      eyebrow: str(t.eyebrow),
      title: str(t.title),
      subtitle: str(t.subtitle),
      body: str(t.body),
      linkLabel: str(t.linkLabel),
    };
    if (!row.eyebrow && !row.title && !row.subtitle && !row.body && !row.linkLabel) continue;
    out.push(row);
  }
  return out;
}

/**
 * Blocks as posted by the form. A row with an unknown kind is dropped rather
 * than rejected — the same reasoning as an empty trailing episode.
 */
export function parseSuperCategoryBlocks(raw: unknown): SuperCategoryBlockInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: SuperCategoryBlockInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (!isBlockKind(v.kind)) continue;

    const refId = str(v.refId);
    const translations = parseSuperCategoryBlockTranslations(v.translations);
    out.push({
      kind: v.kind,
      anchor: optionalStr(v.anchor),
      eyebrow: optionalStr(v.eyebrow),
      title: optionalStr(v.title),
      subtitle: optionalStr(v.subtitle),
      body: optionalStr(v.body),
      linkLabel: optionalStr(v.linkLabel),
      linkUrl: optionalStr(v.linkUrl),
      image: optionalStr(v.image),
      youtubeId: v.youtubeId === undefined ? undefined : parseYoutubeId(v.youtubeId) || undefined,
      refId: OBJECT_ID.test(refId) ? refId : undefined,
      maxItems: optionalInt(v.maxItems),
      order: out.length,
      isActive: boolDefaultTrue(v.isActive),
      ...(translations.length ? { translations: { create: translations } } : {}),
    });
  }
  return out;
}
