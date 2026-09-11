import { prisma } from "@/lib/prisma";
import { SITE_URL, LOCALES } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";

/**
 * Sharded sitemap.
 *
 * One document for this site runs to ~20 MB: 19 locales across ~420 entities is
 * roughly 8,000 <url> blocks, and each block carries a reciprocal <xhtml:link>
 * for every locale — Google requires each language version to list all the
 * others, including itself, so the cost is quadratic in locale count. Vercel
 * refuses to prerender any response over 19.07 MB (FALLBACK_BODY_TOO_LARGE),
 * which that comfortably exceeded.
 *
 * So the document is split, and /sitemap.xml became a sitemap index pointing at
 * the shards. Shards are capped by ENTITY count rather than URL count: one
 * entity always expands to LOCALES.length URLs whose alternates reference each
 * other, and splitting that set across files would break the annotation.
 */

/** 100 entities -> ~1,900 <url> blocks -> roughly 5 MB, a wide margin. */
const SHARD_SIZE = 100;

export type SitemapEntry = {
  loc: string;
  lastModified: Date;
  changeFrequency: string;
  priority: number;
  alternates: Record<string, string>;
};

const STATIC_PATHS = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "/campaigns", changeFrequency: "daily", priority: 0.9 },
  { path: "/about-us", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact-us", changeFrequency: "monthly", priority: 0.6 },
  { path: "/bank-transfer", changeFrequency: "monthly", priority: 0.75 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
];

type Translation = { locale: string; slug: string | null };

function pickSlugFor(locale: string, baseSlug: string | null | undefined, translations: Translation[], fallback: string): string {
  const t = translations.find((tt) => tt.locale === locale && tt.slug);
  return t?.slug || baseSlug || fallback;
}

function staticAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = `${SITE_URL}/${locale}${path}`;
  languages["x-default"] = `${SITE_URL}/ar${path}`;
  return languages;
}

function entityAlternates(basePath: string, baseSlug: string | null | undefined, translations: Translation[], fallback: string): Record<string, string> {
  const url = (loc: string) => `${SITE_URL}/${loc}${basePath}/${encodeURIComponent(pickSlugFor(loc, baseSlug, translations, fallback))}`;
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = url(locale);
  languages["x-default"] = url("ar");
  return languages;
}

/** Expand one entity into its per-locale URL entries, all sharing one alternates map. */
function expand(alternates: Record<string, string>, lastModified: Date, changeFrequency: string, priority: number): SitemapEntry[] {
  return LOCALES.map((locale) => ({ loc: alternates[locale], lastModified, changeFrequency, priority, alternates }));
}

/**
 * A super category lives at `/{locale}/{localized projects slug}/{slug}`, so
 * its alternates are built from the per-locale slug table rather than from one
 * canonical path — the canonical spelling 301s to the localized one, and a
 * sitemap that lists redirects wastes the crawl it is asking for.
 */
function superCategoryAlternates(slug: string): Record<string, string> {
  const url = (locale: string) =>
    `${SITE_URL}/${locale}/${encodeURIComponent(slugFor("projectDetail", locale))}/${encodeURIComponent(slug)}`;
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = url(locale);
  languages["x-default"] = url("ar");
  return languages;
}

/** Shard ids in index order. Groups with no rows contribute no shard. */
export async function listShardIds(): Promise<string[]> {
  const ids = ["static"];
  try {
    const [campaigns, categories, posts] = await Promise.all([
      prisma.campaign.count({ where: { isActive: true } }),
      prisma.category.count(),
      prisma.post.count({ where: { published: true } }),
    ]);
    const push = (name: string, total: number) => {
      for (let i = 0; i * SHARD_SIZE < total; i++) ids.push(`${name}-${i}`);
    };
    push("campaigns", campaigns);
    push("categories", categories);
    push("posts", posts);
  } catch {
    // A database blip must not take the whole sitemap down; the static shard
    // still describes the pages that do not depend on content rows.
  }
  return ids;
}

/** Entries for one shard, or null when the id names no shard we publish. */
export async function buildShard(id: string): Promise<SitemapEntry[] | null> {
  if (id === "static") {
    const now = new Date();
    const statics = STATIC_PATHS.flatMap((s) => expand(staticAlternates(s.path), now, s.changeFrequency, s.priority));

    /* Super categories are whole programme pages and there are only a handful,
       so they ride in the static shard rather than earning one of their own. */
    let supers: SitemapEntry[] = [];
    try {
      const rows = await prisma.superCategory.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { order: "asc" },
      });
      supers = rows.flatMap((row) => expand(superCategoryAlternates(row.slug), row.updatedAt, "weekly", 0.85));
    } catch {
      // Same reasoning as listShardIds: a database blip must not empty the shard.
    }

    return [...statics, ...supers];
  }

  const match = /^(campaigns|categories|posts)-(\d+)$/.exec(id);
  if (!match) return null;
  const [, group, indexRaw] = match;
  const skip = Number(indexRaw) * SHARD_SIZE;

  if (group === "campaigns") {
    const rows = await prisma.campaign.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, updatedAt: true, translations: { select: { locale: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      skip,
      take: SHARD_SIZE,
    });
    return rows.flatMap((c) => expand(entityAlternates("/campaign", c.slug, c.translations, c.id), c.updatedAt, "weekly", 0.85));
  }

  if (group === "categories") {
    const rows = await prisma.category.findMany({
      select: { id: true, slug: true, translations: { select: { locale: true, slug: true } } },
      orderBy: { id: "asc" },
      skip,
      take: SHARD_SIZE,
    });
    const now = new Date();
    return rows.flatMap((c) => expand(entityAlternates("/category", c.slug, c.translations, c.id), now, "weekly", 0.7));
  }

  const rows = await prisma.post.findMany({
    where: { published: true },
    select: { id: true, slug: true, updatedAt: true, translations: { select: { locale: true, slug: true } } },
    orderBy: { updatedAt: "desc" },
    skip,
    take: SHARD_SIZE,
  });
  return rows.flatMap((p) => expand(entityAlternates("/blog", p.slug, p.translations, p.id), p.updatedAt, "monthly", 0.65));
}

const xmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function renderUrlset(entries: SitemapEntry[]): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const e of entries) {
    parts.push("<url>");
    parts.push(`<loc>${xmlEscape(e.loc)}</loc>`);
    parts.push(`<lastmod>${e.lastModified.toISOString()}</lastmod>`);
    parts.push(`<changefreq>${e.changeFrequency}</changefreq>`);
    parts.push(`<priority>${e.priority}</priority>`);
    for (const [hreflang, href] of Object.entries(e.alternates)) {
      parts.push(`<xhtml:link rel="alternate" hreflang="${xmlEscape(hreflang)}" href="${xmlEscape(href)}"/>`);
    }
    parts.push("</url>");
  }
  parts.push("</urlset>");
  return parts.join("\n");
}

export function renderIndex(shardIds: string[], lastModified: Date): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const id of shardIds) {
    parts.push("<sitemap>");
    parts.push(`<loc>${xmlEscape(`${SITE_URL}/sitemap/${id}.xml`)}</loc>`);
    parts.push(`<lastmod>${lastModified.toISOString()}</lastmod>`);
    parts.push("</sitemap>");
  }
  parts.push("</sitemapindex>");
  return parts.join("\n");
}
