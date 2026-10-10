import "server-only";

import { unstable_cache } from "next/cache";
import { listProjects } from "@/lib/minbar/projects";
import { listArticles, listNews } from "@/lib/minbar/posts";
import { miaPath } from "@/lib/minbar/routes";

export type PublicSearchItem = {
  id: string;
  type: "project" | "article" | "news";
  title: string;
  summary: string;
  href: string;
  image: string | null;
};

/** Cache only published, public catalogue metadata (never donor data). */
const searchableContent = unstable_cache(
  async (locale: string): Promise<PublicSearchItem[]> => {
    const [projects, articlesPage, news] = await Promise.all([
      listProjects(locale),
      listArticles({ locale, take: 400 }),
      listNews(locale, 100),
    ]);
    const newsIds = new Set(news.map((item) => item.id));
    const articleIds = new Set(articlesPage.items.map((item) => item.id));
    return [
      ...projects.map((item): PublicSearchItem => ({
        id: `project-${item.id}`,
        type: "project",
        title: item.title,
        summary: item.text,
        href: miaPath("projectDetail", locale, item.slug),
        image: item.image,
      })),
      ...articlesPage.items.map((item): PublicSearchItem => ({
        id: `article-${item.id}`,
        type: newsIds.has(item.id) ? "news" : "article",
        title: item.title,
        summary: item.excerpt,
        href: `${miaPath("blog", locale)}/${encodeURIComponent(item.slug)}`,
        image: item.cover,
      })),
      ...news.filter((item) => !articleIds.has(item.id)).map((item): PublicSearchItem => ({
        id: `news-${item.id}`,
        type: "news",
        title: item.title,
        summary: item.excerpt,
        href: `${miaPath("blog", locale)}/${encodeURIComponent(item.slug)}`,
        image: item.cover,
      })),
    ];
  },
  ["minbar-public-catalogue-search-v1"],
  { revalidate: 60 }
);

export function normalizeSearchText(text: string): string {
  return text.normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchPublicContent(
  locale: string,
  rawQuery: string,
  take = 24,
): Promise<PublicSearchItem[]> {
  const query = rawQuery.trim().slice(0, 90);
  if (query.length < 2) return [];
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const entries = await searchableContent(locale);
  const ranked: Array<{ item: PublicSearchItem; score: number }> = [];
  for (const item of entries) {
    const title = normalizeSearchText(item.title);
    const summary = normalizeSearchText(item.summary);
    if (!terms.every((term) => title.includes(term) || summary.includes(term))) continue;
    const score = (title === terms.join(" ") ? 20 : 0)
      + (title.startsWith(terms[0]) ? 10 : 0)
      + terms.filter((term) => title.includes(term)).length * 4
      + (item.type === "project" ? 1 : 0);
    ranked.push({ item, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.min(Math.max(take, 1), 60)).map((entry) => entry.item);
}
