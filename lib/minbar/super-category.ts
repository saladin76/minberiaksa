import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { listProjects, type MinbarProject } from "./projects";
import { listArticles, type MinbarArticle } from "./posts";
import {
  listBooklets,
  listCourses,
  listPlaylists,
  listReports,
  listVideos,
  type CmsCourse,
  type CmsDocument,
  type CmsPlaylist,
  type CmsVideo,
} from "./cms";
import {
  BLOCK_SOURCE_KIND,
  type SuperCategoryBlockKindValue,
  type SuperCategoryItemKindValue,
} from "@/lib/content/super-category-write";

/**
 * Server-side reader for super categories — the themed landing pages that
 * gather content of every kind (`prisma/schema.prisma`, `model SuperCategory`).
 *
 * Sibling of `lib/minbar/cms.ts`. Text arrives already resolved for the
 * visitor's locale — Arabic from the row, anything else from the translation
 * with English as the fallback — so the page component never sees a translation
 * table.
 *
 * Linked content is resolved through the existing public readers rather than by
 * querying each model here. Those readers already apply the published/active
 * filters and the translation fallback, and reusing them is what keeps a
 * campaign card on this page identical to the same card on the projects page.
 * A linked row that has since been deleted or unpublished simply does not come
 * back, and the block renders without it.
 */

export interface SuperCategoryBlockContent {
  key: string;
  kind: SuperCategoryBlockKindValue;
  anchor: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  image: string;
  youtubeId: string;
  /** Resolved content for the grid kinds, in the editor's order. */
  campaigns: MinbarProject[];
  posts: MinbarArticle[];
  videos: CmsVideo[];
  playlists: CmsPlaylist[];
  courses: CmsCourse[];
  reports: CmsDocument[];
  booklets: CmsDocument[];
  /** The one playlist a `PLAYLIST_EPISODES` block renders. */
  playlist: CmsPlaylist | null;
}

export interface SuperCategoryContent {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  intro: string;
  verseArabic: string;
  verseTranslation: string;
  verseAttribution: string;
  heroImage: string;
  logoImage: string;
  accentColor: string;
  /** Empty when this edition does not carry the hero film. */
  heroVideoId: string;
  ctas: Array<{ label: string; href: string }>;
  metaTitle: string;
  metaDescription: string;
  blocks: SuperCategoryBlockContent[];
}

const DEFAULT_ACCENT = "#7C2318";

const PAGE_SELECT = {
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
  items: { orderBy: { order: "asc" as const }, select: { kind: true, refId: true, order: true } },
  blocks: {
    where: { isActive: true },
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
    },
  },
} as const;

/** Every published super category slug — for the sitemap and static params. */
export async function listSuperCategorySlugs(): Promise<string[]> {
  const rows = await prisma.superCategory.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

/**
 * One super category's whole page, or `null` when the slug is unknown or the
 * row is not published.
 */
export async function getSuperCategory(
  slug: string,
  locale: string
): Promise<SuperCategoryContent | null> {
  const row = await prisma.superCategory.findFirst({
    where: { slug, isActive: true },
    select: {
      ...PAGE_SELECT,
      translations: {
        where: translationLocaleWhere(locale),
        take: 2,
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
    },
  });
  if (!row) return null;

  const t = pickTranslation(row.translations, locale);

  /* Which kinds this page actually links. Only those are fetched — a page of
     campaigns must not pay for the course and booklet queries. */
  const linked = new Map<SuperCategoryItemKindValue, string[]>();
  for (const item of row.items) {
    const list = linked.get(item.kind) ?? [];
    list.push(item.refId);
    linked.set(item.kind, list);
  }
  /* A PLAYLIST_EPISODES block names its playlist directly rather than linking
     it, so the playlist reader is needed for that too. */
  const needsPlaylist =
    linked.has("PLAYLIST") || row.blocks.some((b) => b.kind === "PLAYLIST_EPISODES" && b.refId);

  const [campaigns, posts, videos, playlists, courses, reports, booklets] = await Promise.all([
    linked.has("CAMPAIGN") ? listProjects(locale) : Promise.resolve([] as MinbarProject[]),
    linked.has("POST")
      ? listArticles({ locale, take: 60 }).then((r) => r.items)
      : Promise.resolve([] as MinbarArticle[]),
    linked.has("VIDEO") ? listVideos(locale) : Promise.resolve([] as CmsVideo[]),
    needsPlaylist ? listPlaylists(locale) : Promise.resolve([] as CmsPlaylist[]),
    linked.has("COURSE") ? listCourses(locale) : Promise.resolve([] as CmsCourse[]),
    linked.has("REPORT") ? listReports(locale) : Promise.resolve([] as CmsDocument[]),
    linked.has("BOOKLET") ? listBooklets(locale) : Promise.resolve([] as CmsDocument[]),
  ]);

  /** Pick the linked rows of one kind, in the order the editor put them in. */
  const pick = <T extends { id: string }>(kind: SuperCategoryItemKindValue, pool: T[], max?: number | null): T[] => {
    const ids = linked.get(kind);
    if (!ids?.length) return [];
    const byId = new Map(pool.map((row) => [row.id, row] as const));
    const out: T[] = [];
    for (const id of ids) {
      const found = byId.get(id);
      if (found) out.push(found);
    }
    return max && max > 0 ? out.slice(0, max) : out;
  };

  const blockTranslations = await prisma.superCategoryBlockTranslation.findMany({
    where: { blockId: { in: row.blocks.map((b) => b.id) }, ...translationLocaleWhere(locale) },
    select: { blockId: true, locale: true, eyebrow: true, title: true, subtitle: true, body: true, linkLabel: true },
  });
  const perBlock = new Map<string, typeof blockTranslations>();
  for (const tr of blockTranslations) {
    const list = perBlock.get(tr.blockId) ?? [];
    list.push(tr);
    perBlock.set(tr.blockId, list);
  }

  const blocks: SuperCategoryBlockContent[] = row.blocks.map((b) => {
    const bt = pickTranslation(perBlock.get(b.id) ?? [], locale);
    const source = BLOCK_SOURCE_KIND[b.kind as SuperCategoryBlockKindValue];
    return {
      key: b.id,
      kind: b.kind as SuperCategoryBlockKindValue,
      anchor: b.anchor ?? "",
      eyebrow: bt?.eyebrow || b.eyebrow || "",
      title: bt?.title || b.title || "",
      subtitle: bt?.subtitle || b.subtitle || "",
      body: bt?.body || b.body || "",
      linkLabel: bt?.linkLabel || b.linkLabel || "",
      linkUrl: b.linkUrl ?? "",
      image: b.image ?? "",
      youtubeId: b.youtubeId ?? "",
      campaigns: source === "CAMPAIGN" ? pick("CAMPAIGN", campaigns, b.maxItems) : [],
      posts: source === "POST" ? pick("POST", posts, b.maxItems) : [],
      videos: source === "VIDEO" ? pick("VIDEO", videos, b.maxItems) : [],
      playlists: source === "PLAYLIST" ? pick("PLAYLIST", playlists, b.maxItems) : [],
      courses: source === "COURSE" ? pick("COURSE", courses, b.maxItems) : [],
      reports: source === "REPORT" ? pick("REPORT", reports, b.maxItems) : [],
      booklets: source === "BOOKLET" ? pick("BOOKLET", booklets, b.maxItems) : [],
      playlist:
        b.kind === "PLAYLIST_EPISODES" && b.refId
          ? playlists.find((p) => p.id === b.refId) ?? null
          : null,
    };
  });

  const ctas = [
    { label: t?.ctaPrimaryLabel || row.ctaPrimaryLabel || "", href: row.ctaPrimaryHref || "" },
    { label: t?.ctaSecondaryLabel || row.ctaSecondaryLabel || "", href: row.ctaSecondaryHref || "" },
    { label: t?.ctaTertiaryLabel || row.ctaTertiaryLabel || "", href: row.ctaTertiaryHref || "" },
  ].filter((c) => c.label && c.href);

  /* An empty locale list means every edition carries the film. */
  const showHeroVideo =
    !!row.heroVideoId &&
    (row.heroVideoLocales.length === 0 || row.heroVideoLocales.includes(locale));

  return {
    id: row.id,
    slug: row.slug,
    title: t?.title || row.title,
    subtitle: t?.subtitle || row.subtitle || "",
    intro: t?.intro || row.intro || "",
    verseArabic: row.verseArabic ?? "",
    verseTranslation: t?.verseTranslation || row.verseTranslation || "",
    verseAttribution: t?.verseAttribution || row.verseAttribution || "",
    heroImage: row.heroImage ?? "",
    logoImage: t?.logoImage || row.logoImage || "",
    accentColor: row.accentColor || DEFAULT_ACCENT,
    heroVideoId: showHeroVideo ? row.heroVideoId ?? "" : "",
    ctas,
    metaTitle: t?.metaTitle || row.metaTitle || "",
    metaDescription: t?.metaDescription || row.metaDescription || "",
    blocks,
  };
}
