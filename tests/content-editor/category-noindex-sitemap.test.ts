import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function sitemap(row: Record<string, unknown>) {
  const source = readFileSync("lib/sitemap.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Set, Map,
    require: (name: string) => {
      if (name === "@/lib/prisma") return { prisma: { category: { findMany: async () => [row] } } };
      if (name === "@/lib/seo") return { SITE_URL: "https://example.org", LOCALES: ["ar", "en", "fr"] };
      if (name === "@/lib/content-editor/contracts") return { hasText: (value: unknown) => typeof value === "string" && Boolean(value.trim()) };
      if (name === "@/lib/content-editor/page-seo-sitemap") return {};
      if (name === "@/lib/minbar/routes") return { SLUGS: {}, NOINDEX_ROUTES: new Set(), slugFor: () => "projects" };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return loaded.exports as { buildShard: (id: string) => Promise<Array<{ loc: string; alternates: Record<string, string> }>> };
}
test("an Arabic noindex category is absent from every sitemap URL and reciprocal alternate", async () => {
  const result = await sitemap({id:"category",slug:"arabic",seoNoIndex:"true",translations:[
    {locale:"en",slug:"english",name:"English category"},
    {locale:"fr",slug:"french",name:"Catégorie",seoNoIndex:"true"},
  ]}).buildShard("categories-0");
  assert.equal(result.length,1);
  assert.equal(result[0].loc,"https://example.org/en/category/english");
  assert.deepEqual(Object.keys(result[0].alternates).sort(),["en","x-default"]);
  assert.equal(result[0].alternates["x-default"],result[0].loc);
});
test("hiding all category editions emits no sitemap entry", async () => {
  const result = await sitemap({id:"category",slug:"arabic",seoNoIndex:"true",translations:[
    {locale:"en",name:"Category",seoNoIndex:"true"},
  ]}).buildShard("categories-0");
  assert.equal(result.length,0);
});
test("a category without an Arabic noindex override keeps its Arabic edition", async () => {
  const result = await sitemap({id:"category",slug:"arabic",translations:[]}).buildShard("categories-0");
  assert.equal(result.length,1);
  assert.equal(result[0].loc,"https://example.org/ar/category/arabic");
});
