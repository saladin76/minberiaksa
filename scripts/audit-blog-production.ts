/**
 * scripts/audit-blog-production.ts — read-only.
 *
 * `DEPLOYED_VS_DESIGN_AUDIT.md` § P1.4–P1.7 all trace to one question: does
 * the production database carry the blog content the repository's seed
 * carries? (`prisma/seed/seed-posts.json` has 258 posts with unique
 * descriptions, 16 consolidated categories and per-post covers; a deploy does
 * not import it.) This compares the two and prints the gaps. It writes
 * nothing — the import is `prisma/seed/seed-posts.ts`, run deliberately.
 *
 *   npx tsx scripts/audit-blog-production.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedPost = { slug: string; title: string; description: string; image?: string | null; coverImage?: string | null; categoryName: string; published: boolean; contentMarkdown?: string | null; content?: string | null };
type SeedFile = { categories: Array<{ name: string; slug: string }>; posts: SeedPost[] };

const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function main() {
  const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma/seed/seed-posts.json"), "utf8")) as SeedFile;
  const seedBySlug = new Map(seed.posts.map((p) => [p.slug, p]));

  const [posts, categories] = await Promise.all([
    prisma.post.findMany({ select: { id: true, slug: true, title: true, description: true, image: true, content: true, published: true, category: { select: { name: true, slug: true } } } }),
    prisma.postCategory.findMany({ select: { id: true, name: true, slug: true, _count: { select: { posts: true } } } }),
  ]);

  const published = posts.filter((p) => p.published);
  const descriptions = published.map((p) => normalise(p.description ?? ""));
  const descCounts = new Map<string, number>();
  for (const d of descriptions) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
  const duplicateDescriptions = [...descCounts.entries()].filter(([d, n]) => d && n > 1);
  const emptyBodies = published.filter((p) => !(p.content ?? "").trim()).length;
  const emptyDescriptions = published.filter((p) => !(p.description ?? "").trim()).length;

  const missingFromDb = seed.posts.filter((p) => !posts.some((d) => d.slug === p.slug));
  const notInSeed = posts.filter((d) => d.slug && !seedBySlug.has(d.slug));
  const drift = { description: 0, cover: 0, category: 0, title: 0 };
  for (const d of posts) {
    const s = d.slug ? seedBySlug.get(d.slug) : undefined;
    if (!s) continue;
    if (normalise(d.description ?? "") !== normalise(s.description ?? "")) drift.description += 1;
    if ((d.image ?? "") !== (s.coverImage ?? s.image ?? "")) drift.cover += 1;
    if ((d.category?.name ?? "") !== s.categoryName) drift.category += 1;
    if (normalise(d.title ?? "") !== normalise(s.title ?? "")) drift.title += 1;
  }

  const emptyCategories = categories.filter((c) => c._count.posts === 0);
  const seedCategoryNames = new Set(seed.categories.map((c) => c.name));
  const categoriesNotInSeed = categories.filter((c) => !seedCategoryNames.has(c.name));

  console.log(JSON.stringify({
    production: {
      posts: posts.length,
      published: published.length,
      categories: categories.length,
      emptyCategories: emptyCategories.map((c) => c.name),
      categoriesNotInSeed: categoriesNotInSeed.map((c) => `${c.name} (${c._count.posts})`),
      emptyBodies,
      emptyDescriptions,
      duplicateDescriptionGroups: duplicateDescriptions.length,
      postsInDuplicateGroups: duplicateDescriptions.reduce((n, [, c]) => n + c, 0),
      sampleDuplicate: duplicateDescriptions[0]?.[0].slice(0, 120) ?? null,
    },
    seed: { posts: seed.posts.length, categories: seed.categories.length },
    diff: {
      missingFromDb: missingFromDb.length,
      notInSeed: notInSeed.map((p) => p.slug).slice(0, 10),
      notInSeedCount: notInSeed.length,
      driftBySlug: drift,
    },
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
