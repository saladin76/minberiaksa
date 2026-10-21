import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
const { documentFor } = require("../lib/content-editor/service.ts");
const css = (
  await postcss([
    tailwindcss({ content: ["components/dashboard/content-editor/*.tsx"] }),
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
let stored = documentFor("categories", fixture),
  failedSave = false,
  saves = 0,
  delay = null;
const temp = await mkdtemp(path.join(tmpdir(), "content-editor-ui-"));
const bundle = await build({
  stdin: {
    contents: `import React from "react"; import {createRoot} from "react-dom/client"; import {ContentEditor} from "./components/dashboard/content-editor/ContentEditor"; createRoot(document.getElementById("root")).render(<ContentEditor kind="categories" id="${id}"/>);`,
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
        b.onResolve({ filter: /^next\/(link|dynamic|image)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture-next",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture-next" }, (args) => ({
          contents:
            args.path === "next/link" || args.path === "next/image"
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
  if (req.url === "/test.css") {
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
            kind: "categories",
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
        Object.assign(stored.values, input.localeChanges || {});
        Object.assign(stored.settings, input.settings || {});
        stored.values[input.locale] = {
          ...stored.values[input.locale],
          ...input.changes,
        };
        stored.revision = "saved-" + saves;
        res.end(JSON.stringify(stored));
        return;
      }
      res.end(JSON.stringify(stored));
    });
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage({
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
  await page
    .getByRole("button", { name: "ملء الحقول الفارغة في المسودة", exact: true })
    .click();
  assert.equal(await title.inputValue(), "Titre proposé");
  assert.equal(saves, 0);
  failedSave = true;
  await page
    .getByRole("button", { name: "حفظ التغييرات", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "فشل حفظ تجريبي" })
    .waitFor();
  assert.equal(await title.inputValue(), "Titre proposé");
  failedSave = false;
  await page
    .getByRole("button", { name: "حفظ التغييرات", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "تم الحفظ والتحقق" })
    .waitFor();
  assert.equal(await title.inputValue(), "Titre proposé");
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
    .filter({ hasText: "تغير النص أثناء الطلب" })
    .waitFor();
  assert.equal(await title.inputValue(), "Edited while generating");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "التراجع", exact: true }).click();
  assert.equal(await title.inputValue(), "Titre proposé");
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
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks: 11,
      passed: true,
      screenshots: temp,
      scope:
        "real React editor with mocked HTTP; rich editor not mounted in category fixture",
    }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
