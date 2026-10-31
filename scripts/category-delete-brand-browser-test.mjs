// Local acceptance only: synthetic categories, no production writes or messages.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "tailwindcss";
const require = createRequire(import.meta.url);
const artifactDir = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor", "category-delete-brand");
await mkdir(artifactDir, { recursive: true });
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const label = (lang, ar) => lang === "ar" ? ar : dictionaries[lang][ar];
const mocks = {
  "next/navigation": "export function useRouter(){return {push(){},refresh(){}}}",
  "next-intl": "export function useLocale(){return new URLSearchParams(location.search).get('lang')||'ar'}",
  "next-auth/react": "export function useSession(){return {data:{user:{role:'ADMIN'}}}}",
  "@/components/dashboard/ProjectFilterOrderDialog": "export function ProjectFilterOrderDialog(){return null}",
  "@/components/dashboard/CategoryLinkedProjects": "export function CategoryLinkedProjects(){return null}",
  "@/components/dashboard/content-editor/TranslationOverview": "export function TranslationOverview(){return null}",
  "./_components/ReorderDialog": "export function ReorderDialog(){return null}",
  "./_components/CategoryCampaignPriorityDialog": "export function CategoryCampaignPriorityDialog(){return null}",
  "../_components/DashboardLocaleSwitcher": "export function DashboardLocaleSwitcher(){return null}",
  "../_components/ContentLocalizationAuditCard": "export function ContentLocalizationAuditCard(){return null}",
};
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'react-hot-toast';import {setDashLocale} from './lib/dashboard/i18n';import Page from './app/(dashboard)/dashboard/categories/page';const lang=new URLSearchParams(location.search).get('lang')||'ar';setDashLocale(lang);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<><Page/><Toaster/></>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "synthetic-adapters", setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "adapter" } : null);
    b.onLoad({ filter: /.*/, namespace: "adapter" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() }));
  } }],
});
const css = (await postcss([tailwind({ ...require("../tailwind.config.ts").default, content: ["app/(dashboard)/dashboard/categories/**/*.tsx", "components/dashboard/**/*.tsx", "components/ui/**/*.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;
const seed = () => [
  { id: "empty", name: "Empty", campaignCount: 0, linkedCampaignCount: 0, archivedCampaignCount: 0, deletedCampaignCount: 0 },
  { id: "deleted", name: "Deleted", campaignCount: 0, linkedCampaignCount: 0, archivedCampaignCount: 0, deletedCampaignCount: 5 },
  { id: "financial", name: "Financial", campaignCount: 0, linkedCampaignCount: 0, archivedCampaignCount: 0, deletedCampaignCount: 0 },
  { id: "live", name: "Existing", campaignCount: 0, linkedCampaignCount: 2, archivedCampaignCount: 2, deletedCampaignCount: 0 },
].map(row => ({ ...row, description: null, image: null, order: 0, isActive: true }));
let rows = seed(), writes = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture.test");
  const json = (value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
  if (url.pathname === "/api/categories/detailed") return json({ items: rows, hasMore: false, nextCursor: null });
  if (request.method === "DELETE" && url.pathname.startsWith("/api/categories/")) {
    const id = url.pathname.split("/").at(-1); writes.push(id);
    if (id === "financial") return json({ code: "CATEGORY_HAS_REFERENCES", references: { projects: 0, donations: 7, subscriptions: 2, pages: 1 } }, 409);
    if (id === "live") return json({ code: "CATEGORY_HAS_REFERENCES", references: { projects: 2, donations: 0, subscriptions: 0, pages: 0 } }, 409);
    rows = rows.filter(row => row.id !== id); return json({ state: "deleted" });
  }
  if (url.pathname.startsWith("/api/")) return json({ error: "Unexpected fixture request" }, 404);
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser, checks = 0;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  for (const lang of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    rows = seed(); writes = [];
    const page = await browser.newPage({ viewport: { width, height: 920 } });
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);
    const deletedRow = page.getByRole("row").filter({ hasText: "Deleted" });
    await expect(deletedRow.getByText(label(lang, "{0} مشاريع في المحذوفات").replace("{0}", "5"), { exact: true })).toBeVisible(); checks++;
    await expect(page.getByRole("button", { name: label(lang, "حذف التصنيف: {0}").replace("{0}", "Existing"), exact: true })).toBeDisabled(); checks++;
    await deletedRow.getByRole("button", { name: label(lang, "حذف التصنيف: {0}").replace("{0}", "Deleted"), exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(label(lang, "سجلات المشاريع المحذوفة وتبرعاتها ستبقى محفوظة.")); checks++;
    await dialog.getByRole("button", { name: label(lang, "حذف"), exact: true }).click();
    await expect(deletedRow).toHaveCount(0); assert.deepEqual(writes, ["deleted"]); checks++;
    for (const name of ["Empty", "Financial"]) await page.getByRole("row").filter({ hasText: name }).getByRole("checkbox").check();
    await page.getByRole("button", { name: label(lang, "حذف ({0})").replace("{0}", "2"), exact: true }).click();
    const alert = page.getByRole("alert").filter({ hasText: label(lang, "تصنيفات لم يتم حذفها") });
    await expect(alert).toContainText("Financial"); await expect(alert).toContainText("7"); await expect(alert).toContainText("2"); checks++;
    await expect(page.getByRole("row").filter({ hasText: "Empty" })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "Financial" }).getByRole("checkbox")).toBeChecked(); checks++;
    assert.deepEqual(writes, ["deleted", "empty", "financial"]); checks++;
    await page.screenshot({ path: path.join(artifactDir, `categories-${lang}-${width}.png`), fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, languages: ["ar", "en", "tr"], widths: [390, 1440], recipientMessages: 0, productionWrites: 0, errors }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
