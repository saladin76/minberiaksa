import "server-only";

import { prisma } from "@/lib/prisma";
import { listProjects, type MinbarProject } from "./projects";
import { listCategories, type MinbarCategory } from "./categories";
import { listArticles, listNews, type MinbarArticle } from "./posts";
import { listCourses, listFaqs, listPlaylists, listVideos, type CmsCourse, type CmsFaq, type CmsPlaylist, type CmsVideo } from "./cms";
import { youtubeEmbed } from "./content/media";
import {
  BUILTIN_EVENT_IDS,
  applyHomeList,
  listNeedsFullPool,
  parseHomeLayout,
  type BuiltinEventId,
  type HomeLayoutConfig,
  type HomeSectionId,
} from "./home-layout";

/** One card of `فعاليتنا`: a built-in recording (titled by the site copy) or an event video. */
export interface HomeEvent {
  id: string;
  /** Set for the three built-in recordings; the section titles them from i18n. */
  builtin: BuiltinEventId | null;
  /** Embed URL; empty for a built-in, whose embed depends on the locale. */
  src: string;
  title: string;
}

/** The layout as the homepage reads it  server only. A missing or broken row is the default layout. */
export async function readHomeLayout(): Promise<HomeLayoutConfig> {
  try {
    const row = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { homeLayout: true },
    });
    return parseHomeLayout(row?.homeLayout ?? null);
  } catch (e) {
    console.error("readHomeLayout:", e);
    return parseHomeLayout(null);
  }
}

/** How many posts to read when a list needs more than its newest slice. */
const POST_POOL = 100;

export interface HomeLists {
  events: HomeEvent[];
  endorsements: CmsVideo[];
  achievements: CmsVideo[];
  programs: CmsPlaylist[];
  courses: CmsCourse[];
  projects: MinbarProject[];
  categories: MinbarCategory[];
  articles: MinbarArticle[];
  news: MinbarArticle[];
  faqs: CmsFaq[];
}

const postTime = (a: MinbarArticle) => ({ id: a.id, createdAt: Date.parse(a.createdAt) || undefined });

/**
 * Every list the homepage renders, already picked and ranked by the layout.
 * `allProjects` is passed in because the page reads it anyway, for the
 * quick-donation select.
 */
export async function resolveHomeLists(locale: string, layout: HomeLayoutConfig, allProjects: MinbarProject[]): Promise<HomeLists> {
  const { lists } = layout;
  const postTake = (id: "articles" | "news") => {
    const cfg = lists[id];
    return listNeedsFullPool(cfg) ? POST_POOL : Math.max(cfg.limit, 1);
  };

  const [categories, courses, playlists, endorsements, achievements, eventVideos, faqs, articlesPage, news] = await Promise.all([
    listCategories(locale),
    listCourses(locale),
    listPlaylists(locale),
    listVideos(locale, "ENDORSEMENT"),
    listVideos(locale, "ACHIEVEMENT"),
    listVideos(locale, "EVENT"),
    listFaqs(locale),
    listArticles({ locale, take: postTake("articles") }),
    listNews(locale, postTake("news")),
  ]);

  const builtinEvents: HomeEvent[] = BUILTIN_EVENT_IDS.map((id) => ({ id, builtin: id, src: "", title: "" }));
  const videoEvents: HomeEvent[] = eventVideos
    .filter((v) => v.youtubeId)
    .map((v) => ({ id: v.id, builtin: null, src: youtubeEmbed(v.youtubeId, { start: v.startSeconds ?? undefined }), title: v.title }));

  const byId = <T extends { id: string }>(item: T) => ({ id: item.id });

  return {
    events: applyHomeList([...builtinEvents, ...videoEvents], lists.events, byId),
    endorsements: applyHomeList(endorsements, lists.endorsements, byId),
    achievements: applyHomeList(achievements, lists.achievements, byId),
    programs: applyHomeList(playlists, lists.programs, byId),
    courses: applyHomeList(courses, lists.courses, byId),
    projects: applyHomeList(allProjects, lists.projects, (p) => ({
      id: p.id,
      raised: p.raised,
      progress: p.goal && p.goal > 0 ? p.raised / p.goal : undefined,
    })),
    categories: applyHomeList(categories, lists.categories, (c) => ({ id: c.id, projectCount: c.projectCount })),
    articles: applyHomeList(articlesPage.items, lists.articles, postTime),
    news: applyHomeList(news, lists.news, postTime),
    faqs: applyHomeList(faqs, lists.faqs, byId),
  };
}

/** The sections to render, in order, with the hidden ones left out. */
export function visibleSections(layout: HomeLayoutConfig): HomeSectionId[] {
  return layout.sections.filter((s) => s.enabled).map((s) => s.id);
}
