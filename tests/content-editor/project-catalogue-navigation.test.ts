import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { messagesFor } from "../../i18n/locale-messages";
import type { MessageObject } from "../../i18n/message-quality";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { buildCatalogueNavigation, type CatalogueNavigationLabels } from "../../lib/minbar/project-catalogue-navigation";
import type { ProjectFilterOption } from "../../lib/minbar/project-filter-options";

function labels(locale: string) { return (messagesFor(locale).projects as MessageObject).catalogueNavigation as CatalogueNavigationLabels; }
function row(baseSlug: string, kind: "category" | "programme" = "category", slug = baseSlug): ProjectFilterOption {
  return { key: `${kind}:${baseSlug}`, id: baseSlug, kind, name: "CMS title", slug, baseSlug, icon: "layout-grid", order: 0, projectIds: ["one"] };
}
function fixture(locale: string) {
  return [row("region-al-quds"), row("ibadan-lana", "programme"), row("alquds-home-restoration", "programme", locale === "tr" ? "kudus-eski-sehrinde-restorasyon-projeleri" : locale === "en" ? "restoration-projects-in-the-old-city-of-jerusalem" : "alquds-home-restoration"), row("region-al-aqsa"), row("region-gaza"), row("type-zakat"), row("type-recurring")];
}
test("the requested eight destinations replace old filter ordering, without duplicate Zakat or recurring entries", () => {
  const rows = fixture("ar"), result = buildCatalogueNavigation("ar", rows, rows.map(row => row.key), labels("ar"));
  assert.deepEqual(result.map(row => row.name), ["غزة", "المسجد الأقصى", "القدس", "أوقف في القدس", "أخرج زكاتك لفلسطين", "ترميم منازل القدس", "عبادًا لنا", "التبرع الدوري"]);
  assert.deepEqual(result.map(row => row.href || null), [null, null, null, "/ar/msharya-alqds-alwqfy", "/ar/pay-zakat-to-palestine", "/ar/bagislar/alquds-home-restoration", "/ar/bagislar/ibadan-lana", "/ar/recurring-donation"]);
  assert.deepEqual(result.slice(0, 3).map(row => row.projectIds), [["one"], ["one"], ["one"]]);
  assert.equal(rows[0].name, "CMS title");
});
test("all 19 languages have their own labels and page links retain that locale and the CMS translated project slug", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const result = buildCatalogueNavigation(locale, fixture(locale), null, labels(locale));
    assert.equal(Object.keys(labels(locale)).length, 8);
    for (const entry of result) {
      assert.ok(entry.name?.trim(), `${locale}: ${entry.key}`);
      if (entry.href) assert.ok(entry.href.startsWith(`/${locale}/`), `${locale}: ${entry.href}`);
      if (locale !== "ar" && locale !== "ur") assert.doesNotMatch(entry.name, /[\u0600-\u06ff]/);
    }
    if (locale === "tr") assert.equal(result[5].href, "/tr/bagislar/kudus-eski-sehrinde-restorasyon-projeleri");
    if (locale === "en") assert.equal(result[5].href, "/en/bagislar/restoration-projects-in-the-old-city-of-jerusalem");
  }
});
test("new CMS entries append automatically and the next dashboard ordering stays authoritative", () => {
  const original = buildCatalogueNavigation("ar", fixture("ar"), null, labels("ar"));
  const saved = original.map(row => row.key).reverse();
  const extra = row("new-category");
  const result = buildCatalogueNavigation("ar", [...fixture("ar"), extra], saved, labels("ar"));
  assert.deepEqual(result.map(row => row.key), [...saved, extra.key]);
});
test("renamed CMS slugs keep their roles and old hash bookmarks while archived regional filters are absent", () => {
  const renamed = { ...row("new-restoration-url", "programme", "restauration-à-jérusalem"), previousSlugs: ["alquds-home-restoration"] };
  const result = buildCatalogueNavigation("fr", [renamed], null, labels("fr"));
  assert.equal(result.length, 5);
  const restored = result.find(row => row.key === "page:restoration")!;
  assert.equal(restored.href, "/fr/bagislar/restauration-%C3%A0-j%C3%A9rusalem");
  assert.ok(restored.hashes?.includes("programme:new-restoration-url"));
  assert.ok(restored.hashes?.includes("alquds-home-restoration"));
  assert.equal(result.some(row => row.key.startsWith("category:")), false);
});
test("the actual catalogue renders dedicated pages as navigable links, and region filters as buttons with counts", () => {
  const loaded = { exports: {} as { default: React.ComponentType<{ projects: unknown[]; slides: unknown[]; filters: ProjectFilterOption[] }> } };
  const Empty = () => null;
  const dependencies: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsx,
    "next-intl": { useTranslations: () => (key: string) => key },
    "next/link": { default: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { delete props.prefetch; return React.createElement("a", props, children); } },
    "@/components/minbar/ProjectDonateCard": { default: Empty },
    "@/components/minbar/states/ContentStates": { NoResults: Empty },
    "@/components/minbar/banners/ZakatBanner": { default: Empty },
    "@/components/minbar/banners/TravelBanner": { default: Empty },
    "@/components/minbar/banners/IbadanBanner": { default: Empty },
    "./CategoryIcons": { default: Empty }, "./ProjectsHero": { default: Empty },
  };
  for (const dependency of Object.values(dependencies)) {
    if (dependency && typeof dependency === "object" && "default" in dependency) Object.assign(dependency, { __esModule: true });
  }
  const source = ts.transpileModule(fs.readFileSync("components/minbar/projects/ProjectsPage.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const filters = buildCatalogueNavigation("ar", fixture("ar"), null, labels("ar"));
  const html = renderToStaticMarkup(React.createElement(loaded.exports.default, { projects: [], slides: [], filters }));
  assert.equal((html.match(/<a\b[^>]*data-filter-key=/g) || []).length, 5);
  assert.equal((html.match(/<button\b[^>]*data-filter-key=/g) || []).length, 4);
  assert.equal((html.match(/class="proj-cat-count"/g) || []).length, 4);
  assert.match(html, /<a href="\/ar\/pay-zakat-to-palestine"[^>]*data-filter-key="page:zakat"/);
  assert.doesNotMatch(html, /<a\b[^>]*aria-(?:pressed|controls)=/);
});
