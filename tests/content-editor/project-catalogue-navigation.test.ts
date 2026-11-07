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
import * as projectOrder from "../../lib/content-editor/project-order";
import { publicProjectFilters, type ProjectFilterOption } from "../../lib/minbar/project-filter-options";

function labels(locale: string) { return (messagesFor(locale).projects as MessageObject).catalogueNavigation as CatalogueNavigationLabels; }
function row(baseSlug: string, kind: "category" | "programme" = "category", slug = baseSlug): ProjectFilterOption {
  return { key: `${kind}:${baseSlug}`, id: baseSlug, kind, name: "CMS title", slug, baseSlug, icon: "layout-grid", order: 0, projectIds: ["one"] };
}
function fixture(locale: string) {
  return [row("region-al-quds"), row("ibadan-lana", "programme"), row("alquds-home-restoration", "programme", locale === "tr" ? "kudus-eski-sehrinde-restorasyon-projeleri" : locale === "en" ? "restoration-projects-in-the-old-city-of-jerusalem" : "alquds-home-restoration"), row("region-al-aqsa"), row("region-gaza"), row("type-zakat"), row("type-recurring")];
}
test("CMS names and saved category/page ordering remain authoritative after page-link binding", () => {
  const rows=fixture("ar");rows[0].name="القدس الجديدة";
  const result=buildCatalogueNavigation("ar",rows,rows.map(row=>row.key),labels("ar"));
  assert.deepEqual(result.map(row=>row.key),[rows[0].key,"page:ibadan","page:restoration",rows[3].key,rows[4].key,"page:zakat","page:recurring","page:waqf"]);
  assert.equal(result[0].name,"القدس الجديدة");
  assert.equal(result.find(row=>row.key==="page:restoration")?.href,"/ar/bagislar/alquds-home-restoration");
  assert.equal(result.filter(row=>row.key==="page:zakat").length,1);
  assert.equal(rows[0].name,"القدس الجديدة");
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
    if (locale === "tr") assert.equal(result.find(row => row.key === "page:restoration")!.href, "/tr/bagislar/kudus-eski-sehrinde-restorasyon-projeleri");
    if (locale === "en") assert.equal(result.find(row => row.key === "page:restoration")!.href, "/en/bagislar/restoration-projects-in-the-old-city-of-jerusalem");
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
  assert.equal(result.length, 4);
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
    react: React, "react/jsx-runtime": jsx, "@/lib/content-editor/project-order": projectOrder,
    "@/lib/minbar/project-filter-options": { publicProjectFilters },
    "next-intl": { useTranslations: (namespace: string) => (key: string) => namespace === "projects.catalogueNavigation" ? labels("ar")[key as keyof CatalogueNavigationLabels] : key },
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
  assert.equal((html.match(/<a\b[^>]*data-filter-key=/g) || []).length, 4);
  assert.equal((html.match(/<button\b[^>]*data-filter-key=/g) || []).length, 4);
  assert.equal((html.match(/class="proj-cat-count"/g) || []).length, 4);
  assert.match(html, /<a href="\/ar\/pay-zakat-to-palestine"[^>]*data-filter-key="page:zakat"/);
  assert.doesNotMatch(html, /<a\b[^>]*aria-(?:pressed|controls)=/);
  assert.deepEqual([...html.matchAll(/data-filter-key="([^"]+)"/g)].map(match => match[1]), ["all", "category:region-gaza", "category:region-al-aqsa", "category:region-al-quds", "page:zakat", "page:waqf", "page:restoration", "page:recurring"]);
  assert.doesNotMatch(html, /data-filter-key="page:ibadan"/);
});
