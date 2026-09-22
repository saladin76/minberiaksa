/**
 * Bulk blog import from seed-posts.json.
 *
 * Default mode is safe/idempotent UPSERT. Use --replace only when MongoDB
 * should intentionally mirror the seed exactly.
 *
 * Commands:
 *   npx tsx prisma/seed/seed-posts.ts --dry
 *   npx tsx prisma/seed/seed-posts.ts
 *   npx tsx prisma/seed/seed-posts.ts --replace
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const REPLACE = process.argv.includes("--replace");

type SeedSeo = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  keyword?: string | null;
  keywords?: string[] | null;
};

type Tr = {
  locale: string;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  slug?: string | null;
  seo?: SeedSeo | null;
};

type SeedCategory = {
  name: string;
  title: string | null;
  description: string | null;
  image: string | null;
  slug: string;
  translations: Tr[];
};

type SeedPost = {
  slug: string;
  title: string;
  description: string;
  content?: string | null;
  contentMarkdown?: string | null;
  image?: string | null;
  coverImage?: string | null;
  imageAlt?: string | null;
  contentStatus?: string | null;
  published: boolean;
  categoryName: string;
  campaignIds: string[];
  translations: Tr[];
  seo?: SeedSeo | null;
};

type SeedFile = {
  _meta?: Record<string, unknown>;
  categories: SeedCategory[];
  posts: SeedPost[];
};

const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seed-posts.json"), "utf8")
) as SeedFile;

const publicPath = (src?: string | null): string | undefined => {
  if (!src) return undefined;
  if (/^(?:https?:)?\/\//i.test(src)) return src;
  const rooted = src.startsWith("/") ? src : "/" + src.replace(/^\.\//, "");
  const webp = rooted.replace(/\.(?:jpe?g|png)$/i, ".webp");
  if (webp !== rooted && fs.existsSync(path.join("public", webp.slice(1)))) {
    return webp;
  }
  return rooted;
};

const articleBody = (post: SeedPost): string | undefined => {
  const markdown = post.contentMarkdown?.trim();
  if (markdown) return markdown;
  const raw = post.content?.trim();
  return raw || undefined;
};

const coverPath = (post: SeedPost): string | undefined =>
  publicPath(post.coverImage || post.image);

const localAssetExists = (src?: string): boolean => {
  if (!src || /^(?:https?:)?\/\//i.test(src)) return true;
  return fs.existsSync(path.join("public", src.replace(/^\//, "")));
};

const smartTrim = (value: string, max: number): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.65 ? slice.slice(0, lastSpace) : slice.slice(0, max)).trim();
};

const keywordPhrase = (title?: string | null): string | undefined => {
  if (!title) return undefined;
  const head = title.split(/[?:؟|—–]/)[0].replace(/^\d+[.)-]?\s*/, "").trim();
  return smartTrim(head, 70) || undefined;
};

const normalizeKeywords = (
  seo: SeedSeo | null | undefined,
  title?: string | null
): string[] => {
  const values = [
    ...(seo?.keywords ?? []),
    seo?.keyword ?? undefined,
    keywordPhrase(title),
  ].filter((v): v is string => Boolean(v?.trim()));
  return Array.from(new Set(values.map((v) => v.trim()))).slice(0, 8);
};

const seoFields = (
  title: string | null | undefined,
  description: string | null | undefined,
  seo?: SeedSeo | null,
  imageAlt?: string | null
) => ({
  metaTitle: smartTrim(seo?.metaTitle || title || "", 68) || undefined,
  metaDescription:
    smartTrim(seo?.metaDescription || description || "", 160) || undefined,
  seoKeywords: normalizeKeywords(seo, title),
  imageAlt: smartTrim(imageAlt || title || "", 140) || undefined,
});

const slugifyUnicode = (value?: string | null): string =>
  (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'"]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);

const translationSlug = (post: SeedPost, t: Tr): string =>
  slugifyUnicode(t.slug) ||
  slugifyUnicode(t.title) ||
  slugifyUnicode(`${post.slug}-${t.locale}`);

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  if (duplicates.size) {
    throw new Error(
      `${label}: duplicate values: ${Array.from(duplicates).join(", ")}`
    );
  }
}

function validateSeed() {
  assertUnique(seed.categories.map((c) => c.name), "categories.name");
  assertUnique(seed.categories.map((c) => c.slug), "categories.slug");
  assertUnique(seed.posts.map((p) => p.slug), "posts.slug");

  const categoryNames = new Set(seed.categories.map((c) => c.name));
  const errors: string[] = [];
  const slugsByLocale = new Map<string, string[]>();

  for (const category of seed.categories) {
    if (!category.name.trim()) errors.push("category with empty name");
    if (!category.slug.trim()) errors.push(`category "${category.name}" has empty slug`);
    try {
      assertUnique(
        category.translations.map((t) => t.locale),
        `category "${category.name}" translations`
      );
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  for (const post of seed.posts) {
    const body = articleBody(post);
    const cover = coverPath(post);
    const shouldPublish =
      post.published &&
      post.contentStatus !== "BODY_MISSING" &&
      Boolean(body);

    if (!post.slug.trim()) errors.push("post with empty slug");
    if (!post.title.trim()) errors.push(`${post.slug}: empty title`);
    if (!post.description?.trim()) errors.push(`${post.slug}: empty description`);
    if (!categoryNames.has(post.categoryName)) {
      errors.push(`${post.slug}: unknown category "${post.categoryName}"`);
    }
    if (!cover) errors.push(`${post.slug}: missing cover image`);
    if (cover && !localAssetExists(cover)) {
      errors.push(`${post.slug}: cover not found in public/: ${cover}`);
    }
    if (post.published && !shouldPublish) {
      errors.push(`${post.slug}: marked published but body is missing/BODY_MISSING`);
    }

    try {
      assertUnique(
        post.translations.map((t) => t.locale),
        `post "${post.slug}" translations`
      );
    } catch (error) {
      errors.push((error as Error).message);
    }

    for (const t of post.translations) {
      const list = slugsByLocale.get(t.locale) ?? [];
      list.push(translationSlug(post, t));
      slugsByLocale.set(t.locale, list);
    }
  }

  for (const [locale, slugs] of slugsByLocale) {
    try {
      assertUnique(slugs, `post translations for locale ${locale}`);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (errors.length) {
    throw new Error(
      `seed-posts preflight failed with ${errors.length} issue(s):\n- ${errors.join("\n- ")}`
    );
  }
}

async function main() {
  validateSeed();

  const ready = seed.posts.filter(
    (p) =>
      p.published &&
      p.contentStatus !== "BODY_MISSING" &&
      Boolean(articleBody(p))
  ).length;
  const translations = seed.posts.reduce(
    (sum, p) => sum + p.translations.length,
    0
  );

  console.log(
    `seed-posts: ${seed.categories.length} categories, ${seed.posts.length} posts, ${translations} translations`
  );
  console.log(
    `ready: ${ready}, unpublished: ${seed.posts.length - ready}, mode: ${DRY ? "dry" : REPLACE ? "replace" : "upsert"}`
  );

  if (DRY) {
    console.log("✓ preflight passed; database unchanged");
    return;
  }

  if (REPLACE) {
    const before = {
      posts: await prisma.post.count(),
      postTranslations: await prisma.postTranslation.count(),
      categories: await prisma.postCategory.count(),
      categoryTranslations: await prisma.postCategoryTranslation.count(),
      superCategoryItems: await prisma.superCategoryItem.count({
        where: { kind: "POST" },
      }),
      storyCtas: await prisma.storySlide.count({
        where: { ctaKind: "POST" },
      }),
    };
    console.log("existing before replace:", before);
    await prisma.superCategoryItem.deleteMany({ where: { kind: "POST" } });
    await prisma.postTranslation.deleteMany({});
    await prisma.post.deleteMany({});
    await prisma.postCategoryTranslation.deleteMany({});
    await prisma.postCategory.deleteMany({});
    console.log("✓ cleared blog collections");
  }

  const categoryIdByName = new Map<string, string>();

  for (const c of seed.categories) {
    const row = await prisma.postCategory.upsert({
      where: { name: c.name },
      update: {
        title: c.title ?? undefined,
        description: c.description ?? undefined,
        image: publicPath(c.image),
        slug: c.slug,
      },
      create: {
        name: c.name,
        title: c.title ?? undefined,
        description: c.description ?? undefined,
        image: publicPath(c.image),
        slug: c.slug,
      },
    });
    categoryIdByName.set(c.name, row.id);

    for (const t of c.translations) {
      await prisma.postCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: row.id, locale: t.locale } },
        update: {
          name: t.name ?? c.name,
          title: t.title ?? undefined,
          description: t.description ?? undefined,
          image: publicPath(t.image),
          slug: t.slug ?? undefined,
        },
        create: {
          categoryId: row.id,
          locale: t.locale,
          name: t.name ?? c.name,
          title: t.title ?? undefined,
          description: t.description ?? undefined,
          image: publicPath(t.image),
          slug: t.slug ?? undefined,
        },
      });
    }
  }

  console.log(`✓ categories: ${categoryIdByName.size}`);

  let postCount = 0;
  let translationCount = 0;
  let publishedCount = 0;

  for (const p of seed.posts) {
    const categoryId = categoryIdByName.get(p.categoryName);
    if (!categoryId) {
      throw new Error(`post ${p.slug}: unknown category "${p.categoryName}"`);
    }

    const body = articleBody(p);
    const published =
      p.published &&
      p.contentStatus !== "BODY_MISSING" &&
      Boolean(body);

    const base = {
      title: p.title,
      description: p.description || undefined,
      content: body,
      image: coverPath(p),
      ...seoFields(p.title, p.description, p.seo, p.imageAlt),
      published,
      categoryId,
      campaignIds: p.campaignIds ?? [],
    };

    const row = await prisma.post.upsert({
      where: { slug: p.slug },
      update: base,
      create: { ...base, slug: p.slug },
    });

    for (const t of p.translations) {
      const localizedSeo = seoFields(
        t.title || p.title,
        t.description || p.description,
        t.seo,
        t.imageAlt || p.imageAlt
      );
      const localizedSlug = translationSlug(p, t);

      await prisma.postTranslation.upsert({
        where: { postId_locale: { postId: row.id, locale: t.locale } },
        update: {
          title: t.title ?? undefined,
          description: t.description ?? undefined,
          content: t.content ?? undefined,
          image: publicPath(t.image),
          slug: localizedSlug,
          ...localizedSeo,
        },
        create: {
          postId: row.id,
          locale: t.locale,
          title: t.title ?? undefined,
          description: t.description ?? undefined,
          content: t.content ?? undefined,
          image: publicPath(t.image),
          slug: localizedSlug,
          ...localizedSeo,
        },
      });
      translationCount++;
    }

    if (published) publishedCount++;
    postCount++;
  }

  console.log(
    `✓ posts: ${postCount} (published: ${publishedCount}, translations: ${translationCount})`
  );
  console.log("✓ bulk blog import completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
