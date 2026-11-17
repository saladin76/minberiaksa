import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
/* eslint-disable @typescript-eslint/no-explicit-any */
const D = { super: 130, project: 610, seo: 260, urls: 130, edSeo: 130, content: 260 };
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
function load(file: string, world: any) {
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const memo = new Map(); const comp = (name) => Object.defineProperty(function () {}, "name", { value: name });
  const stubs = {
    "@/i18n/locale-messages": { messagesFor: () => ({ navigation: { home: "H", projects: "P" } }) },
    react: { cache: (fn: any) => (...a: any[]) => { const k = fn.toString() + JSON.stringify(a); if (!memo.has(k)) memo.set(k, fn(...a)); return memo.get(k); } },
    "react/jsx-runtime": { jsx: (t: any, p: any) => ({ t: typeof t === "string" ? t : t.name, p: JSON.parse(JSON.stringify({ ...p, children: undefined })), c: p.children }), jsxs: (t: any, p: any) => ({ t: typeof t === "string" ? t : t.name, c: p.children }), Fragment: comp("Fragment") },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); }, permanentRedirect: (u: string) => { throw new Error("REDIRECT " + u); } },
    "@/lib/seo": { SITE_URL: "https://x", buildPageMetadata: (l, o) => ({ ...o }), buildLocalizedAlternates: () => "alt", clipSeoDescription: (s) => s },
    "@/lib/minbar/projects": { getProject: () => (world.projectError ? wait(D.project).then(() => { throw new Error("DB"); }) : wait(D.project, world.project)), getProjectSeo: () => wait(D.seo, { locale: { seoTitle: "T" }, campaign: {} }) },
    "@/lib/minbar/project-page-content": { getProjectPageContent: () => wait(D.content, { updates: [], related: [1], donorCount: 5, comments: [], gallery: [] }) },
    "@/lib/minbar/routes": { miaPath: (...a: any[]) => a.join("/"), slugFor: () => "bagislar" },
    "@/lib/minbar/super-category": { getSuperCategory: () => wait(D.super, world.super) },
    "@/lib/content-editor/public-seo": { applyEditorialSeo: (m, e) => ({ ...m, ed: e }), readPublicEditorialSeo: () => wait(D.edSeo, { robots: "x" }), readPublicEditorialUrls: () => wait(D.urls, { availableLocales: ["ar"] }) },
    "@/lib/minbar/redirect-query": { withIncomingQuery: (u: string) => u },
  };
  for (const n of ["MinbarMessages", "ProjectDetail", "SuperCategoryPage", "PageBanners"]) stubs["@/components/minbar/" + (n === "MinbarMessages" ? n : n === "PageBanners" ? "banners/" + n : "projects/" + n)] = { default: comp(n), __esModule: true };
  stubs["@/components/content/EditorialFaq"] = { EditorialFaq: comp("EditorialFaq") };
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require: (n) => { if (!(n in stubs)) throw new Error("no stub " + n); return stubs[n]; }, Promise, JSON, setTimeout, decodeURIComponent, encodeURIComponent });
  return mod.exports;
}
async function run(file: string, world: any) {
  const m = load(file, world); const props = { params: Promise.resolve({ locale: "ar", slug: "gaza-bread" }), searchParams: Promise.resolve({}) };
  const t = performance.now(); let unhandled = 0; const onU = () => unhandled++; process.on("unhandledRejection", onU);
  const settle = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e.message }));
  const [meta, page] = await Promise.all([settle(m.generateMetadata(props)), settle(m.default(props))]);
  await wait(20); process.off("unhandledRejection", onU);
  return { ms: Math.round(performance.now() - t), out: JSON.stringify({ meta, page }), unhandled };
}

const PAGE = "app/[locale]/bagislar/[slug]/page.tsx";
const project = { id: "p1", slug: "gaza-bread", title: "Bread", text: "t", image: "i", imageAlt: "a" };
const programme = { slug: "gaza-bread", title: "Prog", localizations: [], availableLocales: ["ar"] };

test("a project page no longer waits for the programme check before reading the project", async () => {
  const r = await run(PAGE, { project, super: null });
  assert.ok(r.ms < D.super + D.project + D.seo + D.edSeo - 150, `took ${r.ms} ms`);
  assert.match(r.out, /ProjectDetail/); assert.match(r.out, /"ed":\{"robots":"x"\}/);
});

test("a programme still owns its slug, and a failed project lookup there is harmless", async () => {
  const ok = await run(PAGE, { project, super: programme });
  assert.match(ok.out, /SuperCategoryPage/); assert.doesNotMatch(ok.out, /ProjectDetail/);
  const failing = await run(PAGE, { projectError: true, super: programme });
  assert.match(failing.out, /SuperCategoryPage/); assert.equal(failing.unhandled, 0);
});

test("missing, renamed and failing projects behave exactly as before", async () => {
  assert.match((await run(PAGE, { project: null, super: null })).out, /NOT_FOUND/);
  assert.match((await run(PAGE, { project: { ...project, slug: "new-slug", redirectedFrom: "gaza-bread" }, super: null })).out, /REDIRECT/);
  assert.match((await run(PAGE, { projectError: true, super: null })).out, /"err":"DB"/);
});
