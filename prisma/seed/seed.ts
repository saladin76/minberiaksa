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
import { PrismaClient } from "@prisma/client";
import seed from "./seed-data.json";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Tr = { locale: string; name?: string; title?: string; description?: string; slug?: string };

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
  console.log("Seeding:", seed._meta.counts);

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
