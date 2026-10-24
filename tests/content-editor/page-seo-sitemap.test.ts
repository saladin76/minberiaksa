import test from "node:test";
import assert from "node:assert/strict";
import { filterManagedPageSitemap } from "../../lib/content-editor/page-seo-sitemap";
import { MANAGED_SEO_PAGES, managedPagePath } from "../../lib/content-editor/page-seo-registry";
test("every managed page has one stable identity and a localized path", () => {
  assert.equal(new Set(MANAGED_SEO_PAGES.map((page) => page.key)).size, MANAGED_SEO_PAGES.length);
  for (const page of MANAGED_SEO_PAGES) for (const locale of ["ar", "en", "tr"])
    assert.ok(page.key === "home" || managedPagePath(page.key, locale).startsWith("/"));
});
test("page noindex removes only the chosen locale and its reciprocal sitemap alternate", () => {
  const base = "https://example.org", en = base + "/en", ar = base + "/ar";
  const entries = [{ loc: en, alternates: { en, ar, "x-default": en } }, { loc: ar, alternates: { en, ar, "x-default": en } }];
  const result = filterManagedPageSitemap(entries, [{ key: "home", overrides: { en: { seoNoIndex: "true" }, ar: { seoNoIndex: "false" } } }], base);
  assert.deepEqual(result, [{ loc: ar, alternates: { ar, "x-default": ar } }]);
  assert.equal(entries.length, 2);
});
test("unconfigured pages and other locales keep their existing sitemap links", () => {
  const entries = [{ loc: "https://example.org/en", alternates: { en: "https://example.org/en" } }];
  assert.equal(filterManagedPageSitemap(entries, [], "https://example.org")[0].loc, entries[0].loc);
});
