/**
 * prisma/seed.ts — بذر بيانات موقع مؤسسة منبر الأقصى الدولية
 * ---------------------------------------------------------------
 * يقرأ seed-data.json (المولَّد من مصادر الموقع: projects-data.js + projects-i18n.js
 * + blog-articles-data.js + blog-i18n.js) ويكتبه في MongoDB عبر Prisma.
 *
 * التشغيل:
 *   npx prisma generate
 *   npx tsx prisma/seed.ts          # أو: npx ts-node prisma/seed.ts
 *
 * idempotent: كل شيء upsert على الـslug — إعادة التشغيل تحدّث ولا تكرّر.
 */
import { PrismaClient, PlaylistKind, VideoType } from "@prisma/client";
import seed from "./seed-data.json";
import extra from "./seed-data-extra.json";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Tr = { locale: string; name?: string; title?: string; description?: string; slug?: string };

/** A YouTube entry under a playlist or a course.
 *  Declared rather than inferred: every course in seed-data-extra.json currently
 *  ships `videos: []`, which TypeScript narrows to `never[]` — so the fields
 *  would be unreachable the moment real episodes are added to the file. */
type SeedVideoRef = {
  youtubeId: string;
  url: string;
  thumbnail?: string | null;
  title?: string | null;
  durationSeconds?: number | null;
  order: number;
  isActive?: boolean;
};

/**
 * Media that lives in `public/` is served from the site root, but the generated
 * data stores it repo-relative (`assets/blog/x.jpg`). A relative src breaks the
 * blog cards — and `next/image`, which the dashboard blog list uses, rejects it
 * outright — so give every non-absolute path its leading slash. Absolute URLs
 * (the campaigns' Drive links) pass through untouched.
 *
 * The covers ship as WebP: re-encoding the originals cut them from 181 MB to
 * 19 MB, which is the difference between a push that times out and one that
 * doesn't. seed-data.json still names the source .jpg/.png, so prefer a .webp
 * sibling whenever one exists rather than editing the generated data — that
 * way regenerating it from the site sources can't reintroduce the heavy paths.
 */
const publicPath = (src?: string | null): string | undefined => {
  if (!src) return undefined;
  if (/^(?:https?:)?\/\//i.test(src)) return src;
  const rooted = src.startsWith("/") ? src : "/" + src.replace(/^\.\//, "");
  const webp = rooted.replace(/\.(?:jpe?g|png)$/i, ".webp");
  if (webp !== rooted && fs.existsSync(path.join("public", webp.slice(1)))) return webp;
  return rooted;
};

async function main() {
  console.log("Seeding:", seed._meta.counts, extra._meta.counts);

  /* ── 1) Category (مناطق + أنواع تبرع) ───────────────────────── */
  const categoryIdByKey = new Map<string, string>();
  for (const c of seed.categories) {
    const row = await prisma.category.upsert({
      where: { name: c.name },
      update: { slug: c.slug, order: c.order, isActive: c.isActive },
      create: { name: c.name, slug: c.slug, order: c.order, isActive: c.isActive },
    });
    categoryIdByKey.set(c.externalKey, row.id);
    for (const t of c.translations as Tr[]) {
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: row.id, locale: t.locale } },
        update: { name: t.name!, slug: t.slug },
        create: { categoryId: row.id, locale: t.locale, name: t.name!, slug: t.slug },
      });
    }
  }
  console.log(`✓ categories: ${categoryIdByKey.size}`);

  /* ── 2) Campaign (المشاريع) ─────────────────────────────────── */
  let campaignCount = 0;
  for (const p of seed.campaigns) {
    const categoryIds = p.categoryKeys
      .map((k: string) => categoryIdByKey.get(k))
      .filter((id): id is string => Boolean(id));

    const base = {
      title: p.title,
      description: p.description,
      targetAmount: p.targetAmount,
      currentAmount: p.currentAmount,
      baselineAmount: p.baselineAmount,
      goalType: p.goalType,
      fundraisingMode: p.fundraisingMode,
      sharePriceUSD: p.sharePriceUSD ?? undefined,
      images: (p.images as string[]).map(publicPath).filter((v): v is string => Boolean(v)),
      videoUrl: p.videoUrl ?? undefined,
      isActive: p.isActive,
      isDeleted: false,
      priority: p.priority,
      categories: { set: categoryIds.map((id) => ({ id })) },
    };

    const row = await prisma.campaign.upsert({
      where: { slug: p.slug },
      update: base,
      create: { ...base, slug: p.slug, categories: { connect: categoryIds.map((id) => ({ id })) } },
    });

    for (const t of p.translations as Tr[]) {
      await prisma.campaignTranslation.upsert({
        where: { campaignId_locale: { campaignId: row.id, locale: t.locale } },
        update: { title: t.title!, description: t.description!, slug: t.slug },
        create: { campaignId: row.id, locale: t.locale, title: t.title!, description: t.description!, slug: t.slug },
      });
    }
    campaignCount++;
  }
  console.log(`✓ campaigns: ${campaignCount}`);

  /* ── 3) PostCategory (تصنيفات المدونة) ──────────────────────── */
  const postCatIdByKey = new Map<string, string>();
  for (const c of seed.postCategories) {
    const row = await prisma.postCategory.upsert({
      where: { name: c.name },
      update: { slug: c.slug },
      create: { name: c.name, slug: c.slug },
    });
    postCatIdByKey.set(c.externalKey, row.id);
    for (const t of c.translations as Tr[]) {
      await prisma.postCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: row.id, locale: t.locale } },
        update: { name: t.name! },
        create: { categoryId: row.id, locale: t.locale, name: t.name! },
      });
    }
  }
  console.log(`✓ postCategories: ${postCatIdByKey.size}`);

  /* ── 4) Post (المقالات) ─────────────────────────────────────── */
  let postCount = 0;
  for (const a of seed.posts) {
    const categoryId = postCatIdByKey.get(a.categoryKey);
    const base = {
      title: a.title,
      description: a.description,
      content: a.content,
      image: publicPath(a.image),
      published: a.published,
      categoryId,
    };
    const row = await prisma.post.upsert({
      where: { slug: a.slug },
      update: base,
      create: { ...base, slug: a.slug },
    });
    for (const t of a.translations as Tr[]) {
      await prisma.postTranslation.upsert({
        where: { postId_locale: { postId: row.id, locale: t.locale } },
        update: { title: t.title, description: t.description, slug: t.slug },
        create: { postId: row.id, locale: t.locale, title: t.title, description: t.description, slug: t.slug },
      });
    }
    postCount++;
  }
  console.log(`✓ posts: ${postCount}`);

  /* ── 5) Story (شريط القصص) ──────────────────────────────────
   * `startsAt`/`endsAt` are carried through as they come — null means the story
   * runs indefinitely. The 24-hour default belongs to the dashboard's create
   * path, not here: a seed re-run must not start rewriting the windows of
   * stories an editor has already scheduled. */
  let storyCount = 0;
  for (const s of extra.stories) {
    const base = {
      title: s.title,
      image: publicPath(s.image)!,
      linkUrl: s.linkUrl ?? undefined,
      order: s.order,
      isActive: s.isActive,
      startsAt: s.startsAt ? new Date(s.startsAt) : null,
      endsAt: s.endsAt ? new Date(s.endsAt) : null,
    };
    const row = await prisma.story.upsert({
      where: { slug: s.slug },
      update: base,
      create: { ...base, slug: s.slug },
    });
    for (const t of s.translations as Tr[]) {
      await prisma.storyTranslation.upsert({
        where: { storyId_locale: { storyId: row.id, locale: t.locale } },
        update: { title: t.title! },
        create: { storyId: row.id, locale: t.locale, title: t.title! },
      });
    }
    storyCount++;
  }
  console.log(`✓ stories: ${storyCount}`);

  /* ── 6) VideoPlaylist + PlaylistVideo (برامجنا المصورة) ─────
   * Episodes are replaced wholesale rather than upserted: they have no stable
   * key of their own, and YouTube is the source of truth for what a playlist
   * contains. deleteMany-then-createMany keeps a re-run from stacking
   * duplicates, and is why the parent upsert comes first — the children need
   * its id. */
  let playlistCount = 0;
  let playlistVideoCount = 0;
  for (const p of extra.playlists) {
    const base = {
      title: p.title,
      description: p.description ?? undefined,
      youtubePlaylistUrl: p.youtubePlaylistUrl ?? undefined,
      kind: p.kind === "SERIES" ? PlaylistKind.SERIES : PlaylistKind.PROGRAM,
      coverImage: publicPath((p as { coverImage?: string }).coverImage),
      order: p.order,
      isActive: p.isActive,
    };
    const row = await prisma.videoPlaylist.upsert({
      where: { slug: p.slug },
      update: base,
      create: { ...base, slug: p.slug },
    });

    for (const t of p.translations as Tr[]) {
      await prisma.playlistTranslation.upsert({
        where: { playlistId_locale: { playlistId: row.id, locale: t.locale } },
        update: { title: t.title!, description: t.description },
        create: {
          playlistId: row.id,
          locale: t.locale,
          title: t.title!,
          description: t.description,
        },
      });
    }

    await prisma.playlistVideo.deleteMany({ where: { playlistId: row.id } });
    if (p.videos.length) {
      await prisma.playlistVideo.createMany({
        data: (p.videos as SeedVideoRef[]).map((v) => ({
          playlistId: row.id,
          youtubeId: v.youtubeId,
          url: v.url,
          thumbnail: v.thumbnail ?? undefined,
          title: v.title ?? undefined ?? undefined,
          durationSeconds: v.durationSeconds ?? undefined ?? undefined,
          order: v.order,
          isActive: v.isActive,
        })),
      });
      playlistVideoCount += p.videos.length;
    }
    playlistCount++;
  }
  console.log(`✓ playlists: ${playlistCount} (episodes: ${playlistVideoCount})`);

  /* ── 7) Course + CourseVideo (دوراتنا) ──────────────────────── */
  let courseCount = 0;
  let courseVideoCount = 0;
  for (const c of extra.courses) {
    const base = {
      title: c.title,
      description: c.description ?? undefined,
      coverImage: publicPath(c.coverImage),
      introVideoId: c.introVideoId ?? undefined,
      introVideoUrl: c.introVideoUrl ?? undefined,
      unitsCount: c.unitsCount ?? undefined,
      isPinned: c.isPinned,
      isExternal: c.isExternal,
      externalUrl: c.externalUrl ?? undefined,
      hasDetailPage: c.hasDetailPage,
      order: c.order,
      isActive: c.isActive,
    };
    const row = await prisma.course.upsert({
      where: { slug: c.slug },
      update: base,
      create: { ...base, slug: c.slug },
    });

    for (const t of c.translations as Tr[]) {
      await prisma.courseTranslation.upsert({
        where: { courseId_locale: { courseId: row.id, locale: t.locale } },
        update: { title: t.title!, description: t.description },
        create: {
          courseId: row.id,
          locale: t.locale,
          title: t.title!,
          description: t.description,
        },
      });
    }

    await prisma.courseVideo.deleteMany({ where: { courseId: row.id } });
    if (c.videos.length) {
      await prisma.courseVideo.createMany({
        data: (c.videos as SeedVideoRef[]).map((v) => ({
          courseId: row.id,
          youtubeId: v.youtubeId,
          url: v.url,
          thumbnail: v.thumbnail ?? undefined,
          title: v.title ?? undefined ?? undefined,
          order: v.order,
        })),
      });
      courseVideoCount += c.videos.length;
    }
    courseCount++;
  }
  console.log(`✓ courses: ${courseCount} (videos: ${courseVideoCount})`);

  /* ── 8) Video (إنجازاتنا + تزكياتنا) ────────────────────────
   * `localeFilter` travels verbatim: the Turkish endorsements carry ["tr"] and
   * must stay hidden from every other language, so an empty-array fallback here
   * would quietly publish them everywhere. */
  let videoCount = 0;
  for (const v of extra.videos) {
    const base = {
      type: v.type === "ENDORSEMENT" ? VideoType.ENDORSEMENT
        : v.type === "FIELD" ? VideoType.FIELD
        : VideoType.ACHIEVEMENT,
      title: v.title,
      youtubeId: v.youtubeId ?? undefined,
      url: v.url ?? undefined,
      startSeconds: v.startSeconds ?? undefined,
      thumbnail: publicPath(v.thumbnail),
      regionKey: v.regionKey ?? undefined,
      localeFilter: v.localeFilter ?? [],
      showOnHome: v.showOnHome,
      order: v.order,
      isActive: v.isActive,
    };
    const row = await prisma.video.upsert({
      where: { slug: v.slug },
      update: base,
      create: { ...base, slug: v.slug },
    });
    for (const t of v.translations as Tr[]) {
      await prisma.videoTranslation.upsert({
        where: { videoId_locale: { videoId: row.id, locale: t.locale } },
        update: { title: t.title! },
        create: { videoId: row.id, locale: t.locale, title: t.title! },
      });
    }
    videoCount++;
  }
  console.log(`✓ videos: ${videoCount}`);

  /* Report · Booklet · BankAccount · UrgentBanner · Faq · SiteSetting are
     deliberately NOT seeded. The first two need the official PDF URLs; a
     BankAccount holds live IBANs and a placeholder there sends a donor's
     transfer nowhere; the rest are editorial and managed from the dashboard. */
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
