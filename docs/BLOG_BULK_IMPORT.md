# Blog bulk import to MongoDB

This repository already stores blog content through Prisma on MongoDB.
The canonical bulk source is:

`prisma/seed/seed-posts.json`

The importer is:

`prisma/seed/seed-posts.ts`

## What the importer guarantees

- validates unique category names/slugs and post slugs before touching MongoDB;
- validates every post category reference;
- validates local cover-image paths under `public/`;
- prefers `.webp` covers when the optimized file exists;
- supports both Markdown/plain-text and legacy HTML article bodies;
- stores body-missing articles as unpublished;
- upserts categories, category translations, posts, and post translations by stable keys;
- is idempotent by default, so re-running updates content instead of duplicating it;
- preserves unrelated blog rows unless `--replace` is explicitly supplied.

## Recommended production flow

### 1. Preflight only

```bash
npx tsx prisma/seed/seed-posts.ts --dry
```

This performs all seed validation and does **not** mutate MongoDB.

### 2. Import/update the blog

```bash
npx tsx prisma/seed/seed-posts.ts
```

This is the recommended mode for normal deployment.

### 3. Full replacement, only when intentional

```bash
npx tsx prisma/seed/seed-posts.ts --replace
```

`--replace` clears the blog collections first. Use it only when MongoDB must
mirror the seed exactly. It also removes POST super-category links and reports
story CTAs that may need to be re-linked in the dashboard.

## Environment

The command requires the same `DATABASE_URL` used by Prisma in production.

Do not commit a MongoDB connection string to the repository.

## Article presentation

The public article page accepts:

- Markdown headings such as `## Section title`;
- paragraph blocks separated by blank lines;
- clean HTML `<h1>`–`<h3>`, `<p>`, and `<li>` blocks from older seed material.

HTML is converted to safe text blocks before render; the page does not inject
raw editorial HTML with `dangerouslySetInnerHTML`.

The cover is read from `Post.image` and rendered as a 16:9 article hero.
The same image is used on blog cards unless a locale-specific
`PostTranslation.image` overrides it.

## Publication rule

An article is published only when all are true:

1. the seed marks it `published: true`;
2. it is not `contentStatus: "BODY_MISSING"`;
3. it has a non-empty body.

This prevents title-only drafts from appearing publicly.

## Translation rule

Arabic remains the canonical body. Existing translated titles/descriptions are
imported. A translation body is only written when `translations[].content`
actually contains one; otherwise the Arabic body remains the fallback.


## Multilingual SEO and indexing contract

Each blog post now stores explicit SEO fields on both the Arabic `Post` row and
each `PostTranslation`:

- `metaTitle`
- `metaDescription`
- `seoKeywords` (editorial/search-planning phrases; not relied on as a Google
  meta-keywords ranking signal)
- `imageAlt`

The importer fills missing SEO fields from the localized title/description and
creates stable per-locale slugs.

A locale is **indexable only when it has its own translated article body**.
Arabic is the canonical source language. A locale that only has a translated
title/description may still display the Arabic fallback to a visitor, but the
page receives `noindex,follow` and is omitted from the blog sitemap/hreflang
set. This prevents Arabic fallback bodies from being exposed to search engines
as nineteen duplicate localized pages.

When a translated body is added in the dashboard, that locale automatically
becomes eligible for its own canonical URL, hreflang entry, sitemap URL,
localized Open Graph metadata, Article JSON-LD language and localized image alt
text on the next render.

## Editorial and cover audit

The 258-post seed is treated as a content package, not just database rows.
Before importing:

- every published post must have a non-empty body;
- every local cover path must exist under `public/`;
- post/category slugs and translation locales must be unique;
- body-missing drafts fail publication preflight;
- covers should be selected for the article topic, not only reused by sequence;
- the public renderer and dashboard editor accept the same HTML, Markdown and
  TipTap JSON content safely.

The 2026-09-22 editorial pass completed the previously empty bodies, corrected
known cover mismatches, added SEO metadata/alt text, and reduced high-similarity
template content before release.

## Release sequence

Use this order for production:

```bash
npm run blog:seed:dry
npm run blog:seed
```

Do not put the database import in Vercel's build command. Preview builds and
production builds may point at different environments, and a build must never
mutate editorial collections implicitly.

Use `blog:seed:replace` only for an intentional full replacement after a
backup/review. Normal releases should use the idempotent upsert command.
