import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MINBAR_LOCALE_SEO, MINBAR_OG_LOCALES } from "../../lib/seo-minbar.generated";
import { SUPPORTED_LOCALES } from "../../lib/locales";

/**
 * Release gate for `DEPLOYED_VS_DESIGN_AUDIT.md` § P0.3.
 *
 * The organisation's institutional metadata once described its earlier Syria
 * programme, and 8 of 19 locales still shipped it — through the homepage, the
 * projects/about/contact/blog titles, and `buildPageMetadata()`'s keyword
 * fallback onto every other page. This runs in `npm run build` and fails it if
 * any of those terms comes back, in any language, or if a public locale loses
 * its SEO entry.
 */

/** The retired programme's terms, in every language the site is published in. */
const LEGACY_TERMS: ReadonlyArray<[string, RegExp]> = [
  ["Syria (Latin)", /\bsyria\b/i],
  ["Syrian (Latin)", /\bsyrian/i],
  ["سوريا", /سوريا/],
  ["سوري", /سوري/],
  ["Suriye (tr)", /suriye/i],
  ["Siria (es/it)", /\bsiria\b/i],
  ["Syrien (de/sv/da/no)", /syrien/i],
  ["Syrie (fr)", /\bsyrie\b/i],
  ["Síria (pt)", /síria/i],
  ["Suriah (id/ms)", /suriah/i],
  ["شام (sham, ar/ur)", /\bالشام\b/],
  ["since 2011 claim", /\b2011\b/],
];

const REQUIRED_FIELDS = ["siteName", "title", "description", "keywords", "titleTemplate"] as const;
const REQUIRED_PAGES = ["campaigns", "about", "contact", "blog"] as const;

/**
 * The shortest description that still describes. Sixty characters of Latin
 * or Arabic is a sentence; the same sentence in Japanese or Chinese is a third
 * of that, so the floor follows the script rather than punishing CJK for
 * being dense.
 */
const minDescriptionFor = (locale: string) => (locale === "ja" || locale === "zh" ? 20 : 60);

test("every public locale has a generated SEO entry and an OpenGraph locale tag", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const entry = (MINBAR_LOCALE_SEO as Record<string, unknown>)[locale];
    assert.ok(entry, `missing SEO entry for locale "${locale}"`);
    assert.ok((MINBAR_OG_LOCALES as Record<string, string>)[locale], `missing OG locale for "${locale}"`);
    const seo = entry as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
      assert.ok(seo[field], `${locale}: "${field}" is empty`);
    }
    assert.ok(Array.isArray(seo.keywords) && (seo.keywords as unknown[]).length >= 5, `${locale}: too few keywords`);
    for (const page of REQUIRED_PAGES) {
      const p = seo[page] as { title?: string; description?: string } | undefined;
      assert.ok(p?.title && p.description, `${locale}: "${page}" title/description missing`);
      assert.ok(p.description.length >= minDescriptionFor(locale), `${locale}: "${page}" description too short to describe anything`);
    }
  }
});

test("no locale carries the retired Syria-programme terms in institutional SEO", () => {
  const offenders: string[] = [];
  for (const [locale, entry] of Object.entries(MINBAR_LOCALE_SEO)) {
    const flat = JSON.stringify(entry);
    for (const [label, re] of LEGACY_TERMS) {
      if (re.test(flat)) offenders.push(`${locale}: ${label}`);
    }
  }
  assert.deepEqual(offenders, [], `legacy SEO terms found:\n  ${offenders.join("\n  ")}`);
});

test("lib/seo.ts holds no hand-written locale copy — the generated file is the only source", () => {
  const source = readFileSync("lib/seo.ts", "utf8");
  for (const [label, re] of LEGACY_TERMS) {
    assert.equal(re.test(source), false, `lib/seo.ts contains ${label}`);
  }
  // A second per-locale literal would mean the split the audit flagged is back.
  assert.equal(/\bar:\s*\{\s*siteName/.test(source), false, "lib/seo.ts has an inline `ar: { siteName …` entry");
  assert.ok(/LOCALE_SEO[^=]*=\s*MINBAR_LOCALE_SEO/.test(source), "LOCALE_SEO must be the generated map");
});

/**
 * Files that emit institutional metadata outside `LOCALE_SEO`: the root
 * layout's Organization / WebSite JSON-LD and the locale layout and homepage
 * metadata. The WebSite schema kept its own hand-written description after
 * the rest was cleaned, so these are scanned as source text.
 */
const METADATA_SOURCES = ["app/layout.tsx", "app/[locale]/layout.tsx", "app/[locale]/page.tsx"] as const;

test("structured data and layout metadata carry no retired-programme terms", () => {
  const offenders: string[] = [];
  for (const file of METADATA_SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const [label, re] of LEGACY_TERMS) {
      if (re.test(source)) offenders.push(`${file}: ${label}`);
    }
  }
  assert.deepEqual(offenders, [], `legacy terms in metadata sources:\n  ${offenders.join("\n  ")}`);
});

test("the generated file describes each locale in its own script, not English fallback", () => {
  // Locales whose copy must not be plain ASCII — a sign the bundle fell back to English.
  const nonLatin: Record<string, RegExp> = {
    ar: /[؀-ۿ]/,
    ur: /[؀-ۿ]/,
    ja: /[぀-ヿ一-鿿]/,
    zh: /[一-鿿]/,
    hi: /[ऀ-ॿ]/,
  };
  for (const [locale, re] of Object.entries(nonLatin)) {
    const entry = (MINBAR_LOCALE_SEO as Record<string, { description: string }>)[locale];
    assert.ok(re.test(entry.description), `${locale}: description is not in the locale's script`);
  }
});
