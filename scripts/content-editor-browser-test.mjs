import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
const { documentFor } = require("../lib/content-editor/service.ts");
const { CONTENT_KINDS } = require("../lib/content-editor/contracts.ts");
const { EDITOR_SECTIONS } = require("../lib/content-editor/workspace.ts");
const css = (
  await postcss([
    tailwindcss({ ...require("../tailwind.config.ts").default, content: ["components/dashboard/content-editor/*.tsx", "app/(dashboard)/dashboard/campaigns/_components/*.tsx", "components/ui/*.tsx"] }),
  ]).process("@tailwind base; @tailwind components; @tailwind utilities;", {
    from: undefined,
  })
).css;
const id = "111111111111111111111111";
const fixture = {
  id,
  name: "اختبار التصنيف",
  description: "وصف عربي",
  translations: [
    { locale: "en", name: "Category", description: "English description" },
  ],
  values: [],
  infoCards: [],
};
const documents = new Map(CONTENT_KINDS.map((kind) => [kind, documentFor(kind, kind === "categories" ? fixture : { ...fixture, title: "اختبار " + kind, question: "سؤال تجريبي", answer: "إجابة تجريبية", content: "محتوى تجريبي", slug: "fixture-" + kind, fileUrl: "https://example.org/file.pdf", fileLocale: "ar", url: "https://example.org/video.mp4", blocks: [], items: [], videos: [], updates: [], categories: [], images: [], isActive: true, isPublished: false, goalType: "OPEN", donationMode: "AMOUNT", type: kind === "videos" ? "ACHIEVEMENT" : "PROGRAM" })]));
let stored = documents.get("categories"),
  failedSave = false,
  saves = 0,
  delay = null;
const temp = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor");
await mkdir(temp, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React from "react"; import {createRoot} from "react-dom/client"; import {ContentEditor} from "./components/dashboard/content-editor/ContentEditor"; createRoot(document.getElementById("root")).render(<ContentEditor kind={new URLSearchParams(location.search).get("kind") || "categories"} id="${id}"/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
  jsx: "automatic",
  tsconfig: path.join(process.cwd(), "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "next-standalone",
      setup(b) {
        b.onResolve({ filter: /wysiwyg-editor$/ }, () => ({
          path: "rich-fixture",
          namespace: "fixture-rich",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture-rich" }, () => ({
          contents: "export default function Rich(){return null;}",
          loader: "js",
        }));
        b.onResolve({ filter: /^next\/(link|dynamic|image|navigation)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture-next",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture-next" }, (args) => ({
          contents:
            args.path === "next/navigation"
              ? "export function useRouter(){ return {replace(){}, push(){}, refresh(){}}; }"
              : args.path === "next/image"
              ? 'import React from "react"; export default function Image({src,alt,...props}){return React.createElement("img",{src,alt,...props});}'
              : args.path === "next/link"
              ? 'import React from "react"; export default function Link(props){return React.createElement("a",props,props.children);}'
              : "export default function dynamic(){return function RichFixture(){return null;};}",
          resolveDir: process.cwd(),
          loader: "js",
        }));
      },
    },
  ],
});
const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/super-categories/content-options")) {
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({CAMPAIGN:[],POST:[],VIDEO:[],PLAYLIST:[],COURSE:[],REPORT:[],BOOKLET:[]}));
  } else if (req.url === "/test.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
  } else if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(bundle.outputFiles[0].text);
  } else if (req.url?.startsWith("/api/admin/content-editor/")) {
    if (req.url.endsWith("/catalog")) {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          categories: [],
          campaigns: [],
          postCategories: [],
          linked: {},
        }),
      );
      return;
    }
    const kind = req.url.split("/")[4];
    const doc = documents.get(kind) || stored;
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url.endsWith("/suggest")) {
        const input = JSON.parse(body);
        if (delay) await delay;
        res.end(
          JSON.stringify({
            id,
            kind,
            revision: input.revision,
            action: input.action,
            proposals: {
              fr: {
                values: {
                  name: "Titre proposé",
                  description: "Description proposée",
                },
                warnings: [],
              },
            },
            errors: {},
          }),
        );
        return;
      }
      if (req.method === "PUT") {
        saves++;
        if (failedSave) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "فشل حفظ تجريبي" }));
          return;
        }
        const input = JSON.parse(body);
        Object.assign(doc.values, input.localeChanges || {});
        Object.assign(doc.settings, input.settings || {});
        doc.values[input.locale] = {
          ...doc.values[input.locale],
          ...input.changes,
        };
        doc.revision = "saved-" + saves;
        res.end(JSON.stringify(doc));
        return;
      }
      res.end(JSON.stringify(doc));
    });
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body style="margin:0;background:#f8fafc;padding:16px;font-family:Arial,sans-serif"><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
const errors = [];
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "اختبار التصنيف", exact: true, level: 1 })
    .waitFor();
  await page.getByRole("button", { name: /Français/ }).click();
  const title = page.getByLabel("اسم التصنيف", { exact: true });
  await title.waitFor();
  assert.equal(await title.inputValue(), "");
  await page
    .getByRole("button", { name: "ترجمة الحقول المحددة", exact: true })
    .click();
  await page.getByRole("heading", { name: "مراجعة الاقتراحات" }).waitFor();
  assert.equal(await title.inputValue(), "");
  assert.equal(saves, 0);
  await page.getByLabel("الاقتراح: name", {exact: true}).fill("Titre révisé");
  await page
    .getByRole("button", { name: "ملء الحقول الفارغة في المسودة", exact: true })
    .click();
  assert.equal(await title.inputValue(), "Titre révisé");
  assert.equal(saves, 0);
  failedSave = true;
  await page
    .getByRole("button", { name: "حفظ التغييرات", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "فشل حفظ تجريبي" })
    .waitFor();
  assert.equal(await title.inputValue(), "Titre révisé");
  failedSave = false;
  await page
    .getByRole("button", { name: "حفظ التغييرات", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "تم الحفظ والتحقق" })
    .waitFor();
  assert.equal(await title.inputValue(), "Titre révisé");
  let release;
  delay = new Promise((resolve) => (release = resolve));
  await page
    .getByRole("button", { name: "ترجمة الحقول المحددة", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("جار إعداد الترجمة"),
  );
  await title.fill("Edited while generating");
  release();
  await page
    .getByRole("status")
    .filter({ hasText: /تغير النص أثناء الطلب|أُوقف الطلب/ })
    .waitFor();
  assert.equal(await title.inputValue(), "Edited while generating");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "التراجع", exact: true }).click();
  assert.equal(await title.inputValue(), "Titre révisé");
  await page.getByRole("button", { name: /الرابط وسجل التغييرات/ }).click();
  await page.getByRole("button", { name: "تعديل الرابط", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "حفظ الرابط", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "إلغاء", exact: true }).click();
  assert.equal(saves, 2);
  await page.getByRole("button", { name: /التعريف والظهور/ }).click();
  await title.fill("Unsaved edit");
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "العودة", exact: true }).click();
  assert.equal(warned, true);
  assert.equal(await title.inputValue(), "Unsaved edit");
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("dashboard:check-unsaved-draft", {cancelable:true}))), true, "dashboard language reload must detect the draft");
  await page.getByRole("button", {name: /English/}).click();
  await page.getByRole("button", {name: /Français/}).click();
  assert.equal(await title.inputValue(), "Unsaved edit", "switching content languages must preserve the draft");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile layout must not overflow",
  );
  await page.screenshot({
    path: path.join(temp, "editor-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(temp, "editor-desktop.png"),
    fullPage: true,
  });

  // Mount every supported editor and its actual section controls without production data.
  const snapshots = [];
  for (const locale of ["ar", "en", "tr"]) {
    await page.context().addCookies([{name:"dash-locale", value:locale, url:origin}]);
    for (const kind of CONTENT_KINDS) {
      const view = await browser.newPage({viewport:{width:1440,height:1000}});
      await view.context().addCookies([{name:"dash-locale",value:locale,url:origin}]);
      view.on("pageerror", (e) => errors.push(locale + "/" + kind + ": " + e.message));
      try {
        await view.goto(origin + "/?kind=" + kind);
        await view.getByRole("heading", {level:1}).waitFor();
        if (kind === "videos") { assert.equal(await view.locator("video").count(),1,"MP4 must use the native video player"); assert.equal(await view.locator("iframe").count(),0); }
        const nav = view.locator("nav:has(button[aria-current]) > button");
        for (let i=0; i<EDITOR_SECTIONS[kind].length; i++) {
          await nav.nth(i).click();
          await assert.doesNotReject(() => view.getByRole("heading", {level:1}).waitFor());
          if (kind === "playlists" && locale === "ar" && EDITOR_SECTIONS[kind][i].id === "media") {
            await view.getByRole("button", {name:"إضافة حلقة",exact:true}).click();
            await view.getByRole("textbox", {name:"العنوان",exact:true}).fill("حلقة مراجعة");
            await view.getByRole("textbox", {name:"رابط الفيديو (YouTube / Vimeo / MP4)",exact:true}).fill("https://example.org/episode.mp4");
            assert.equal(saves, 2, "adding an episode remains a draft");
          }
        }
        await nav.nth(0).click();
        if (locale !== "ar") assert.equal(await view.getByRole("button", {name:"حفظ التغييرات",exact:true}).count(),0, "save control must be translated");
        if (locale === "ar") {
          // Also capture the section unique to each content kind.
          const target = kind === "campaigns" ? "donation" : kind === "categories" ? "page" : kind === "super-categories" ? "layout" : ["playlists","courses"].includes(kind) ? "media" : kind === "urgent-banners" ? "display" : "seo";
          const index = EDITOR_SECTIONS[kind].findIndex((x) => x.id === target);
          if (index >= 0) await nav.nth(index).click();
        }
        assert.equal(await view.getByRole("alert").count(),0, locale + "/" + kind + " unexpected error");
        const prefix = locale + "-" + kind;
        await view.screenshot({path:path.join(temp,prefix+"-desktop.png"),fullPage:true});
        await view.setViewportSize({width:390,height:844});
        assert.ok(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), prefix + " mobile layout overflows");
        await view.screenshot({path:path.join(temp,prefix+"-mobile.png"),fullPage:true});
        snapshots.push(prefix);
      } finally {
        await view.screenshot({path:path.join(temp,"last-state.png"),fullPage:true}).catch(()=>{});
        await view.close();
      }
    }
  }
  await writeFile(path.join(temp,"verification.json"),JSON.stringify({snapshots,errors,saves,scope:"Real React editor, 11 content kinds × 3 interface languages × desktop/mobile. HTTP and Next routing/dynamic rich-editor integrations mocked; no production writes."},null,2));

  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks: 16,
      snapshots: snapshots.length * 2,
      passed: true,
      screenshots: temp,
      scope:
        "real React editor; HTTP, Next routing and dynamic rich editor mocked; no production writes",
    }),
  );
} finally {
  if (page) await page.screenshot({path:path.join(temp,"draft-flow-last-state.png"),fullPage:true}).catch(()=>{});
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
