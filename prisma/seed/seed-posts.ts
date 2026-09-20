/**
 * prisma/seed/seed-posts.ts — the blog, replaced wholesale from `seed-posts.json`.
 *
 * Unlike `seed.ts`, which upserts on top of whatever is there, this one
 * clears the blog first: every post, every post translation, every post
 * category and its translations, and the super-category pointers that named
 * a post (`SuperCategoryItem` of kind POST) — those would otherwise dangle.
 * Story slides whose button leads to a post are left as they are but counted
 * and reported, since a slide is an editor's own composition; the reader
 * already skips a target that no longer exists.
 *
 * The JSON is the canonical Arabic (direct fields) plus `translations[]` per
 * locale; a translation's `content` is null throughout (the body has not been
 * translated yet), so only title/description/slug are written per locale.
 * Cover paths are `assets/...` relative to `public/`, and the `.webp` twin is
 * preferred when it exists, as the main seed does.
 *
 *   npx tsx prisma/seed/seed-posts.ts [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

type Tr = { locale: string; name?: string | null; title?: string | null; description?: string | null; content?: string | null; image?: string | null; slug?: string | null };
type SeedCategory = { name: string; title: string | null; description: string | null; image: string | null; slug: string; translations: Tr[] };
type SeedPost = {
  slug: string; title: string; description: string; content: string; image: string; published: boolean;
  categoryName: string; campaignIds: string[]; translations: Tr[];
};
type SeedFile = { categories: SeedCategory[]; posts: SeedPost[] };

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-posts.json"), "utf8")) as SeedFile;

const publicPath = (src?: string | null): string | undefined => {
  if (!src) return undefined;
  if (/^(?:https?:)?\/\//i.test(src)) return src;
  const rooted = src.startsWith("/") ? src : "/" + src.replace(/^\.\//, "");
  const webp = rooted.replace(/\.(?:jpe?g|png)$/i, ".webp");
  if (webp !== rooted && fs.existsSync(path.join("public", webp.slice(1)))) return webp;
  return rooted;
};

async function main() {
  console.log(`seed-posts: ${seed.categories.length} categories, ${seed.posts.length} posts${DRY ? " (dry run)" : ""}`);

  /* ── 0) Clear ───────────────────────────────────────────────── */
  const before = {
    posts: await prisma.post.count(),
    postTranslations: await prisma.postTranslation.count(),
    categories: await prisma.postCategory.count(),
    categoryTranslations: await prisma.postCategoryTranslation.count(),
    superCategoryItems: await prisma.superCategoryItem.count({ where: { kind: "POST" } }),
    storyCtas: await prisma.storySlide.count({ where: { ctaKind: "POST" } }),
  };
  console.log("existing:", before);
  if (before.storyCtas) console.log(`  note: ${before.storyCtas} story slide(s) point at a post; they will need re-linking in the dashboard.`);

  if (!DRY) {
    await prisma.superCategoryItem.deleteMany({ where: { kind: "POST" } });
    await prisma.postTranslation.deleteMany({});
    await prisma.post.deleteMany({});
    await prisma.postCategoryTranslation.deleteMany({});
    await prisma.postCategory.deleteMany({});
    console.log("✓ cleared posts, categories and their translations");
  }

  /* ── 1) Categories ──────────────────────────────────────────── */
  const categoryIdByName = new Map<string, string>();
  for (const c of seed.categories) {
    if (DRY) { categoryIdByName.set(c.name, "dry"); continue; }
    const row = await prisma.postCategory.create({
      data: {
        name: c.name,
        title: c.title ?? undefined,
        description: c.description ?? undefined,
        image: publicPath(c.image),
        slug: c.slug,
        translations: {
          create: c.translations.map((t) => ({
            locale: t.locale,
            name: t.name ?? c.name,
            title: t.title ?? undefined,
            description: t.description ?? undefined,
            image: publicPath(t.image),
            slug: t.slug ?? undefined,
          })),
        },
      },
    });
    categoryIdByName.set(c.name, row.id);
  }
  console.log(`✓ categories: ${categoryIdByName.size}`);

  /* ── 2) Posts ───────────────────────────────────────────────── */
  let count = 0;
  let translationCount = 0;
  for (const p of seed.posts) {
    const categoryId = categoryIdByName.get(p.categoryName);
    if (!categoryId) throw new Error(`post ${p.slug}: unknown category "${p.categoryName}"`);
    translationCount += p.translations.length;
    if (DRY) { count++; continue; }
    await prisma.post.create({
      data: {
        slug: p.slug,
        title: p.title,
        description: p.description || undefined,
        content: p.content || undefined,
        image: publicPath(p.image),
        published: p.published,
        categoryId,
        campaignIds: p.campaignIds ?? [],
        translations: {
          create: p.translations.map((t) => ({
            locale: t.locale,
            title: t.title ?? undefined,
            description: t.description ?? undefined,
            content: t.content ?? undefined,
            image: publicPath(t.image),
            slug: t.slug ?? undefined,
          })),
        },
      },
    });
    count++;
  }
  console.log(`✓ posts: ${count} (${translationCount} translations)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
