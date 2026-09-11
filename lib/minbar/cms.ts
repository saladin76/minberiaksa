import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { videoLiveWhere, type VideoTypeValue } from "@/lib/content/video-write";

/**
 * Server-side readers for the CMS-managed site content, in the shape the
 * public pages render.
 *
 * Sibling of `lib/minbar/projects.ts` and `lib/minbar/posts.ts`, for the models
 * that replaced the hand-written catalogue (`lib/minbar/content/catalog.ts`,
 * `lib/minbar/banks.ts`, the FAQ and report tables): courses, programmes,
 * videos, FAQs, bank accounts, reports and booklets. Every reader takes the
 * visitor's locale and returns text already resolved — Arabic from the row,
 * anything else from the translation with English as the fallback — so a
 * component never sees a translation table.
 *
 * Pages call these on the server and pass the result down. That is what keeps
 * the content in the first HTML response, which `PRODUCTION_SEO_CONTRACT.md`
 * requires of anything that should be indexed.
 */

/* ── Courses ─────────────────────────────────────────────────────────────── */

export interface CmsCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "COURSE" | "SEMINAR";
  coverImage: string;
  introVideoId: string;
  introVideoUrl: string;
  unitsCount: number | null;
  isPinned: boolean;
  isExternal: boolean;
  externalUrl: string;
  hasDetailPage: boolean;
  videos: Array<{ youtubeId: string; url: string; thumbnail: string; title: string }>;
}

export async function listCourses(locale: string): Promise<CmsCourse[]> {
  const rows = await prisma.course.findMany({
    where: { isActive: true },
    orderBy: [{ isPinned: "desc" }, { order: "asc" }],
    select: {
      id: true, slug: true, title: true, description: true, kind: true, coverImage: true,
      introVideoId: true, introVideoUrl: true, unitsCount: true,
      isPinned: true, isExternal: true, externalUrl: true, hasDetailPage: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true } },
      videos: { orderBy: { order: "asc" }, select: { youtubeId: true, url: true, thumbnail: true, title: true } },
    },
  });
  return rows.map((c) => {
    const t = pickTranslation(c.translations, locale);
    return {
      id: c.id,
      slug: c.slug,
      title: t?.title ?? c.title,
      description: t?.description || c.description || "",
      kind: c.kind,
      coverImage: c.coverImage ?? "",
      introVideoId: c.introVideoId ?? "",
      introVideoUrl: c.introVideoUrl ?? "",
      unitsCount: c.unitsCount ?? null,
      isPinned: c.isPinned,
      isExternal: c.isExternal,
      externalUrl: c.externalUrl ?? "",
      hasDetailPage: c.hasDetailPage,
      videos: c.videos.map((v) => ({ youtubeId: v.youtubeId, url: v.url, thumbnail: v.thumbnail ?? "", title: v.title ?? "" })),
    };
  });
}

/* ── Programmes (playlists) ──────────────────────────────────────────────── */

export interface CmsPlaylist {
  id: string;
  slug: string;
  title: string;
  description: string;
  youtubePlaylistUrl: string;
  kind: "PROGRAM" | "SERIES";
  coverImage: string;
  episodes: Array<{ youtubeId: string; url: string; thumbnail: string; title: string; durationSeconds: number | null }>;
}

export async function listPlaylists(locale: string): Promise<CmsPlaylist[]> {
  const rows = await prisma.videoPlaylist.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: {
      id: true, slug: true, title: true, description: true, youtubePlaylistUrl: true, kind: true, coverImage: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true } },
      videos: { where: { isActive: true }, orderBy: { order: "asc" }, select: { youtubeId: true, url: true, thumbnail: true, title: true, durationSeconds: true } },
    },
  });
  return rows
    .map((p) => {
      const t = pickTranslation(p.translations, locale);
      return {
        id: p.id,
        slug: p.slug,
        title: t?.title ?? p.title,
        description: t?.description || p.description || "",
        youtubePlaylistUrl: p.youtubePlaylistUrl ?? "",
        kind: p.kind,
        coverImage: p.coverImage ?? "",
        episodes: p.videos.map((v) => ({ youtubeId: v.youtubeId, url: v.url, thumbnail: v.thumbnail ?? "", title: v.title ?? "", durationSeconds: v.durationSeconds ?? null })),
      };
    })
    /* A programme with no episode has no poster frame and nothing to open. */
    .filter((p) => p.episodes.length > 0);
}

/* ── Videos ──────────────────────────────────────────────────────────────── */

export interface CmsVideo {
  id: string;
  slug: string;
  type: VideoTypeValue;
  title: string;
  youtubeId: string;
  url: string;
  startSeconds: number | null;
  thumbnail: string;
  /** i18n key in the `homepage` namespace for the tag chip, when the row has one. */
  regionKey: string;
  showOnHome: boolean;
}

/**
 * Videos visible to this locale. `localeFilter` is an allow-list on the row —
 * the Turkish endorsements are the reason it exists — and `videoLiveWhere`
 * applies it, so a French visitor never receives a Turkish-only testimonial.
 */
export async function listVideos(locale: string, type?: VideoTypeValue): Promise<CmsVideo[]> {
  const rows = await prisma.video.findMany({
    where: videoLiveWhere(locale, type),
    orderBy: { order: "asc" },
    select: {
      id: true, slug: true, type: true, title: true, youtubeId: true, url: true, startSeconds: true, thumbnail: true, regionKey: true, showOnHome: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true } },
    },
  });
  return rows.map((v) => ({
    id: v.id,
    slug: v.slug,
    type: v.type,
    title: pickTranslation(v.translations, locale)?.title ?? v.title,
    youtubeId: v.youtubeId ?? "",
    url: v.url ?? "",
    startSeconds: v.startSeconds ?? null,
    thumbnail: v.thumbnail ?? "",
    regionKey: v.regionKey ?? "",
    showOnHome: v.showOnHome,
  }));
}

/* ── FAQs ────────────────────────────────────────────────────────────────── */

export interface CmsFaq {
  id: string;
  question: string;
  answer: string;
  /** The category / page scope the row was filed under; "" is general. */
  page: string;
}

export async function listFaqs(locale: string): Promise<CmsFaq[]> {
  const rows = await prisma.faq.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: {
      id: true, question: true, answer: true, page: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, question: true, answer: true } },
    },
  });
  return rows.map((f) => {
    const t = pickTranslation(f.translations, locale);
    return { id: f.id, question: t?.question ?? f.question, answer: t?.answer || f.answer, page: f.page ?? "" };
  });
}

/* ── Bank accounts ───────────────────────────────────────────────────────── */

export interface CmsBankAccount {
  id: string;
  slug: string;
  name: string;
  branch: string;
  holder: string;
  swift: string;
  logo: string;
  currencies: Array<{ code: string; accountNo: string; extNo: string; iban: string }>;
}

/** Accounts published to this locale — `locales` is an allow-list, empty = all. */
export async function listBankAccounts(locale: string): Promise<CmsBankAccount[]> {
  const rows = await prisma.bankAccount.findMany({
    where: { isActive: true, OR: [{ locales: { isEmpty: true } }, { locales: { has: locale } }] },
    orderBy: { order: "asc" },
    select: {
      id: true, slug: true, name: true, branch: true, holder: true, swift: true, logo: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, branch: true, holder: true } },
      currencies: { select: { code: true, accountNo: true, extNo: true, iban: true } },
    },
  });
  return rows.map((b) => {
    const t = pickTranslation(b.translations, locale);
    return {
      id: b.id,
      slug: b.slug,
      name: t?.name ?? b.name,
      branch: t?.branch || b.branch || "",
      holder: t?.holder || b.holder,
      swift: b.swift ?? "",
      logo: b.logo ?? "",
      currencies: b.currencies.map((c) => ({ code: c.code, accountNo: c.accountNo ?? "", extNo: c.extNo ?? "", iban: c.iban ?? "" })),
    };
  });
}

/* ── Reports & booklets ──────────────────────────────────────────────────── */

export interface CmsDocument {
  id: string;
  slug: string;
  title: string;
  description: string;
  fileUrl: string;
  coverImage: string;
  year: number | null;
  /** Booklets only; "" elsewhere. */
  author: string;
}

export async function listReports(locale: string): Promise<CmsDocument[]> {
  const rows = await prisma.report.findMany({
    where: { isPublished: true },
    orderBy: [{ year: "desc" }, { order: "asc" }],
    select: {
      id: true, slug: true, title: true, description: true, fileUrl: true, coverImage: true, year: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true } },
    },
  });
  return rows.map((r) => {
    const t = pickTranslation(r.translations, locale);
    return { id: r.id, slug: r.slug, title: t?.title ?? r.title, description: t?.description || r.description || "", fileUrl: r.fileUrl, coverImage: r.coverImage ?? "", year: r.year ?? null, author: "" };
  });
}

export async function listBooklets(locale: string): Promise<CmsDocument[]> {
  const rows = await prisma.booklet.findMany({
    where: { isPublished: true },
    orderBy: { order: "asc" },
    select: {
      id: true, slug: true, title: true, description: true, author: true, fileUrl: true, coverImage: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true } },
    },
  });
  return rows.map((b) => {
    const t = pickTranslation(b.translations, locale);
    return { id: b.id, slug: b.slug, title: t?.title ?? b.title, description: t?.description || b.description || "", fileUrl: b.fileUrl, coverImage: b.coverImage ?? "", year: null, author: b.author ?? "" };
  });
}
