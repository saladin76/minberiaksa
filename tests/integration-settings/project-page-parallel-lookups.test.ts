import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Measured database round trips from the server (ms). */
const D = { super: 130, project: 610, seo: 260, urls: 130, edSeo: 130, content: 260 };
const wait = <T,>(ms: number, value?: T): Promise<T | undefined> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

type Project = { id: string; slug: string; title: string; text: string; image: string; imageAlt: string; redirectedFrom?: string };
type Programme = { slug: string; title: string; localizations: unknown[]; availableLocales: string[] };
type World = { project?: Project | null; super: Programme | null; projectError?: boolean };
type Element = { t: string; p?: unknown; c?: unknown };
type PageModule = {
  generateMetadata: (props: unknown) => Promise<unknown>;
  default: (props: unknown) => Promise<unknown>;
};

function component(name: string): () => void {
  const fn = function () { /* stub */ };
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

/** Loads the real page file with every dependency replaced by a timed fake. */
function load(file: string, world: World): PageModule {
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const memo = new Map<string, unknown>();
  const nameOf = (t: unknown): string => (typeof t === "string" ? t : (t as { name: string }).name);
  const stubs: Record<string, unknown> = {
    "@/i18n/locale-messages": { messagesFor: () => ({ navigation: { home: "H", projects: "P" } }) },
    react: {
      cache: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
        const key = fn.toString() + JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key);
      },
    },
    "react/jsx-runtime": {
      jsx: (t: unknown, p: Record<string, unknown>): Element => ({ t: nameOf(t), p: JSON.parse(JSON.stringify({ ...p, children: undefined })), c: p.children }),
      jsxs: (t: unknown, p: Record<string, unknown>): Element => ({ t: nameOf(t), c: p.children }),
      Fragment: component("Fragment"),
    },
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      permanentRedirect: (url: string) => { throw new Error("REDIRECT " + url); },
    },
    "@/lib/seo": {
      SITE_URL: "https://x",
      buildPageMetadata: (_locale: string, options: Record<string, unknown>) => ({ ...options }),
      buildLocalizedAlternates: () => "alt",
      clipSeoDescription: (text: string) => text,
    },
    "@/lib/minbar/projects": {
      getProject: () => (world.projectError ? wait(D.project).then(() => { throw new Error("DB"); }) : wait(D.project, world.project)),
      getProjectSeo: () => wait(D.seo, { locale: { seoTitle: "T" }, campaign: {} }),
    },
    "@/lib/minbar/project-page-content": {
      getProjectPageContent: () => wait(D.content, { updates: [], related: [1], donorCount: 5, comments: [], gallery: [] }),
    },
    "@/lib/minbar/routes": { miaPath: (...parts: string[]) => parts.join("/"), slugFor: () => "bagislar" },
    "@/lib/minbar/super-category": { getSuperCategory: () => wait(D.super, world.super) },
    "@/lib/content-editor/public-seo": {
      applyEditorialSeo: (meta: Record<string, unknown>, editorial: unknown) => ({ ...meta, ed: editorial }),
      readPublicEditorialSeo: () => wait(D.edSeo, { robots: "x" }),
      readPublicEditorialUrls: () => wait(D.urls, { availableLocales: ["ar"] }),
    },
    "@/lib/minbar/redirect-query": { withIncomingQuery: (url: string) => url },
    "@/components/minbar/MinbarMessages": { __esModule: true, default: component("MinbarMessages") },
    "@/components/minbar/projects/ProjectDetail": { __esModule: true, default: component("ProjectDetail") },
    "@/components/minbar/projects/SuperCategoryPage": { __esModule: true, default: component("SuperCategoryPage") },
    "@/components/minbar/banners/PageBanners": { __esModule: true, default: component("PageBanners") },
    "@/components/content/EditorialFaq": { EditorialFaq: component("EditorialFaq") },
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(out, {
    module: mod, exports: mod.exports, Promise, JSON, setTimeout, decodeURIComponent, encodeURIComponent,
    require: (name: string) => {
      if (!(name in stubs)) throw new Error("no stub " + name);
      return stubs[name];
    },
  });
  return mod.exports as unknown as PageModule;
}

type Settled = { ok?: unknown; err?: string };
async function run(file: string, world: World): Promise<{ ms: number; out: string; unhandled: number }> {
  const page = load(file, world);
  const props = { params: Promise.resolve({ locale: "ar", slug: "gaza-bread" }), searchParams: Promise.resolve({}) };
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on("unhandledRejection", onUnhandled);
  const settle = (p: Promise<unknown>): Promise<Settled> => p.then((ok) => ({ ok }), (error: Error) => ({ err: error.message }));
  const started = performance.now();
  const [meta, body] = await Promise.all([settle(page.generateMetadata(props)), settle(page.default(props))]);
  const ms = Math.round(performance.now() - started);
  await wait(20);
  process.off("unhandledRejection", onUnhandled);
  return { ms, out: JSON.stringify({ meta, body }), unhandled };
}

const PAGE = "app/[locale]/bagislar/[slug]/page.tsx";
const project: Project = { id: "p1", slug: "gaza-bread", title: "Bread", text: "t", image: "i", imageAlt: "a" };
const programme: Programme = { slug: "gaza-bread", title: "Prog", localizations: [], availableLocales: ["ar"] };

test("a project page no longer waits for the programme check before reading the project", async () => {
  const r = await run(PAGE, { project, super: null });
  assert.ok(r.ms < D.super + D.project + D.seo + D.edSeo - 150, `took ${r.ms} ms`);
  assert.match(r.out, /ProjectDetail/);
  assert.match(r.out, /"ed":\{"robots":"x"\}/);
});

test("a programme still owns its slug, and a failed project lookup there is harmless", async () => {
  const ok = await run(PAGE, { project, super: programme });
  assert.match(ok.out, /SuperCategoryPage/);
  assert.doesNotMatch(ok.out, /ProjectDetail/);
  const failing = await run(PAGE, { projectError: true, super: programme });
  assert.match(failing.out, /SuperCategoryPage/);
  assert.equal(failing.unhandled, 0);
});

test("missing, renamed and failing projects behave exactly as before", async () => {
  assert.match((await run(PAGE, { project: null, super: null })).out, /NOT_FOUND/);
  assert.match((await run(PAGE, { project: { ...project, slug: "new-slug", redirectedFrom: "gaza-bread" }, super: null })).out, /REDIRECT/);
  assert.match((await run(PAGE, { projectError: true, super: null })).out, /"err":"DB"/);
});
