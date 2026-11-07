import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { pickLocaleSlug } from "../../lib/slug";
import { buildHreflang, buildLocalizedAlternates, buildPageMetadata, SITE_URL } from "../../lib/seo";
import { redirectLegacyPath } from "../../lib/minbar/slug-routing";
import { withIncomingQuery } from "../../lib/minbar/redirect-query";

test("all 19 public locales have unique, clean and reciprocal static canonicals", () => {
  assert.equal(SUPPORTED_LOCALES.length, 19);
  for (const locale of SUPPORTED_LOCALES) {
    const result = buildHreflang("/en/blog/?utm_source=test#section", locale);
    assert.equal(result.canonical, `${SITE_URL}/${locale}/blog`);
    assert.equal(result.languages[locale], result.canonical);
    assert.equal(result.languages["x-default"], `${SITE_URL}/ar/blog`);
    assert.equal(new Set(SUPPORTED_LOCALES.map((loc) => result.languages[loc])).size, 19);
    assert.ok(!result.canonical.includes("?"));
  }
});

test("translated entity alternates exactly match public slug fallback without leaking missing translations", () => {
  const translationRows = [
    { locale: "en", slug: "english-project" },
    { locale: "tr", slug: "turkish-project" },
    { locale: "fr", slug: null },
  ];
  const availableLocales = ["ar", "en", "tr", "fr"];
  for (const locale of availableLocales) {
    const result = buildLocalizedAlternates({
      basePath: "/ar/bagislar",
      baseSlug: "مشروع-القدس",
      translations: translationRows,
      fallback: "id-123",
      currentLocale: locale,
      availableLocales,
    });
    const expectedSlug = pickLocaleSlug("مشروع-القدس", translationRows, locale);
    const expected = `${SITE_URL}/${locale}/bagislar/${encodeURIComponent(expectedSlug!)}`;
    assert.equal(result.canonical, expected);
    assert.equal(result.languages[locale], expected);
    assert.equal(result.languages.fr, `${SITE_URL}/fr/bagislar/english-project`);
    assert.equal(Object.keys(result.languages).length, 5);
  }
  const none = buildLocalizedAlternates({
    basePath: "/blog", baseSlug: "article", fallback: "id", currentLocale: "fr", availableLocales: [],
  });
  assert.deepEqual(none.languages, {});
});

test("OpenGraph alternateLocale is limited to actual translated editions", () => {
  const alternates = buildLocalizedAlternates({
    basePath: "/blog", baseSlug: "مقال", fallback: "id", currentLocale: "ar",
    translations: [{ locale: "en", slug: "article" }], availableLocales: ["ar", "en"],
  });
  const meta = buildPageMetadata("ar", { title: "عنوان", description: "وصف", path: "/blog", alternates });
  assert.equal(meta.openGraph?.url, alternates.canonical);
  assert.equal((meta.openGraph as { alternateLocale?: string[] }).alternateLocale?.length, 1);
  assert.equal((meta.alternates as { canonical: string }).canonical, alternates.canonical);
});

test("duplicate locale path redirects once and preserves locale selection", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const nested = `/${locale}/en/fr/المشاريع/x`;
    assert.equal(redirectLegacyPath(nested), `/${locale}/bagislar/x`);
    const url = `/${locale}/en/blog/article`;
    const destination = redirectLegacyPath(url);
    assert.equal(destination, `/${locale}/blog/article`);
    assert.equal(redirectLegacyPath(destination!), null);
  }
});

test("legacy public 301 destinations do not loop and ad tracking survives", () => {
  const old = "/ar/المشاريع/القدس";
  const redirected = redirectLegacyPath(old);
  assert.equal(redirected, "/ar/bagislar/القدس");
  assert.equal(redirectLegacyPath(redirected!), null);
  const url = withIncomingQuery(redirected!, {
    utm_campaign: "aid", gclid: ["one", "two"], ignored: undefined,
  });
  const parsed = new URL(url, SITE_URL);
  assert.equal(parsed.pathname, "/ar/bagislar/%D8%A7%D9%84%D9%82%D8%AF%D8%B3");
  assert.equal(parsed.searchParams.get("utm_campaign"), "aid");
  assert.deepEqual(parsed.searchParams.getAll("gclid"), ["one", "two"]);
});

type FixtureRow = Record<string, unknown>;
type FixtureEntry = { loc: string; alternates: Record<string, string> };
function sitemapFixture(group: "campaigns" | "categories" | "posts", row: FixtureRow) {
  const source = readFileSync("lib/sitemap.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const model = { findMany: async () => [row] };
  const prisma = { campaign: model, category: model, post: model };
  const loaded = { exports: {} as { buildShard: (id: string) => Promise<FixtureEntry[]> } };
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, Date, Set, Map, Object, encodeURIComponent,
    require: (name: string) => {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/slug") return { pickLocaleSlug };
      if (name === "@/lib/seo") return { SITE_URL, LOCALES: SUPPORTED_LOCALES };
      if (name === "@/lib/content-editor/contracts") return { hasText: (v: unknown) => typeof v === "string" && !!v.trim() };
      if (name === "@/lib/content-editor/page-seo-sitemap") return { filterManagedPageSitemap: (a: unknown) => a };
      if (name === "@/lib/minbar/routes") return { SLUGS: {}, NOINDEX_ROUTES: new Set(), slugFor: () => "bagislar" };
      throw new Error("Unexpected import: " + name);
    },
  });
  return loaded.exports.buildShard(group + "-0");
}

test("published campaign sitemap is reciprocal, localized, and excludes absent/noindex editions", async () => {
  const entries = await sitemapFixture("campaigns", {
    id: "id", slug: "مشروع", title: "مشروع", description: "نص", updatedAt: new Date(),
    seoNoIndex: "false", translations: [
      { locale: "en", slug: "project", title: "Project", description: "Details", seoNoIndex: "false" },
      { locale: "fr", slug: null, title: "Projet", description: "Description", seoNoIndex: "false" },
      { locale: "tr", slug: "turkce", title: "Proje", description: "", seoNoIndex: "false" },
      { locale: "de", slug: "german", title: "Projekt", description: "Beschreibung", seoNoIndex: "true" },
    ],
  });
  assert.equal(entries.length, 3);
  const fr = entries.find((entry) => entry.loc.includes("/fr/"));
  assert.equal(fr?.loc, `${SITE_URL}/fr/bagislar/project`);
  for (const entry of entries) {
    assert.equal(Object.keys(entry.alternates).length, 4);
    assert.ok(Object.values(entry.alternates).includes(entry.loc));
    assert.ok(!entry.alternates.tr && !entry.alternates.de);
  }
});

test("static sitemap does not list reserved CMS details when their rows are unpublished", async () => {
  const source = readFileSync("lib/sitemap.ts", "utf8");
  assert.match(source, /route !== "restorationProject" && route !== "ibadanProject"/);
});

test("unpublished Arabic/category copies and noindex articles are not listed", async () => {
  const categories = await sitemapFixture("categories", {
    id: "cat", slug: "arabic", name: "", seoNoIndex: "false",
    translations: [{ locale: "en", slug: "english", name: "Category", seoNoIndex: "false" }],
  });
  assert.equal(categories.length, 1);
  assert.equal(categories[0].loc, `${SITE_URL}/en/category/english`);
  const posts = await sitemapFixture("posts", {
    id: "post", slug: "arabic", title: "Arabic", content: "Content", seoNoIndex: "true", updatedAt: new Date(),
    translations: [{ locale: "en", slug: "english", title: "English", content: "Content", seoNoIndex: "true" }],
  });
  assert.equal(posts.length, 0);
});
