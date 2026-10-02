import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { listProjects } from "@/lib/minbar/projects";
import { listCategories } from "@/lib/minbar/categories";
import { listArticles, listNews, type MinbarArticle } from "@/lib/minbar/posts";
import { youtubeThumb } from "@/lib/minbar/content/media";
import { BUILTIN_EVENT_IDS, BUILTIN_EVENT_LABELS, type HomeListOption, type HomeListOptions } from "@/lib/minbar/home-layout";

/**
 * GET /api/home-layout/options  every item each homepage list can pick from,
 * in that list's dashboard order (the order "ترتيب لوحة التحكم" ranks by), with
 * the facts the other rankings use. Arabic titles; videos are listed whatever
 * their language restriction, which is shown as the subtitle.
 *
 * Only live items: an inactive project or an unpublished post can be neither
 * picked nor previewed, because the homepage would skip it anyway.
 */

const POOL = 100;

const LOCALE_NAMES: Record<string, string> = { ar: "العربية", en: "الإنجليزية", tr: "التركية", fr: "الفرنسية", de: "الألمانية", id: "الإندونيسية", ms: "الماليزية", ur: "الأردية", es: "الإسبانية" };

function videoOption(v: { id: string; title: string; youtubeId: string | null; thumbnail: string | null; localeFilter: string[] }): HomeListOption {
  return {
    id: v.id,
    title: v.title,
    subtitle: v.localeFilter.length ? `يظهر فقط في: ${v.localeFilter.map((l) => LOCALE_NAMES[l] ?? l).join("، ")}` : undefined,
    image: v.thumbnail || (v.youtubeId ? youtubeThumb(v.youtubeId) : null),
  };
}

function postOption(a: MinbarArticle): HomeListOption {
  const date = new Date(a.createdAt);
  return {
    id: a.id,
    title: a.title,
    subtitle: [a.category?.name, Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })].filter(Boolean).join(" · "),
    image: a.cover,
    createdAt: Date.parse(a.createdAt) || undefined,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const videoSelect = { id: true, title: true, youtubeId: true, thumbnail: true, localeFilter: true } as const;
    const videos = (type: "EVENT" | "ENDORSEMENT" | "ACHIEVEMENT") =>
      prisma.video.findMany({ where: { isActive: true, type }, orderBy: { order: "asc" }, select: videoSelect });

    const [events, endorsements, achievements, playlists, courses, projects, categories, articles, news, faqs] = await Promise.all([
      videos("EVENT"),
      videos("ENDORSEMENT"),
      videos("ACHIEVEMENT"),
      prisma.videoPlaylist.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, title: true, coverImage: true, _count: { select: { videos: true } } } }),
      prisma.course.findMany({ where: { isActive: true }, orderBy: [{ isPinned: "desc" }, { order: "asc" }], select: { id: true, title: true, coverImage: true, isPinned: true, kind: true } }),
      listProjects("ar"),
      listCategories("ar"),
      listArticles({ locale: "ar", take: POOL }),
      listNews("ar", POOL),
      prisma.faq.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, question: true, page: true } }),
    ]);

    const options: HomeListOptions = {
      events: [
        ...BUILTIN_EVENT_IDS.map((id) => ({ id, title: BUILTIN_EVENT_LABELS[id], subtitle: "تسجيل مدمج في الموقع" })),
        ...events.filter((v) => v.youtubeId).map(videoOption),
      ],
      endorsements: endorsements.map(videoOption),
      achievements: achievements.map(videoOption),
      programs: playlists.map((p) => ({ id: p.id, title: p.title, subtitle: `${p._count.videos} حلقة`, image: p.coverImage })),
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: [c.kind === "SEMINAR" ? "ندوة" : "دورة", c.isPinned ? "مثبّتة" : ""].filter(Boolean).join(" · "),
        image: c.coverImage,
      })),
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: [p.regionLabel, p.goal ? `${Math.round((p.raised / p.goal) * 100)}% من الهدف` : `$${Math.round(p.raised).toLocaleString("en")} مجموعة`].filter(Boolean).join(" · "),
        image: p.image,
        raised: p.raised,
        progress: p.goal && p.goal > 0 ? p.raised / p.goal : undefined,
      })),
      categories: categories.map((c) => ({ id: c.id, title: c.name, subtitle: `${c.projectCount} مشروع`, image: c.image, projectCount: c.projectCount })),
      articles: articles.items.map(postOption),
      news: news.map(postOption),
      faqs: faqs.map((f) => ({ id: f.id, title: f.question, subtitle: f.page ? `القسم: ${f.page}` : "عام" })),
    };

    return NextResponse.json({ options });
  } catch (e) {
    console.error("GET /api/home-layout/options:", e);
    return NextResponse.json({ error: "Failed to read the homepage items" }, { status: 500 });
  }
}
