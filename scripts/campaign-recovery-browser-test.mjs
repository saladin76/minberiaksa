// Real campaign components; every HTTP request and recipient is a local fixture.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts", "campaign-recovery"); await mkdir(artifacts, { recursive: true });
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const label = (locale, key) => locale === "ar" ? key : dictionaries[locale][key] || key;
const mocks = {
  "next/navigation": "export function useRouter(){return {push(url){window.fixtureNavigation=url}}}",
  "next/link": "import React from 'react';export default function Link(p){return <a {...p}/>}",
  "next-auth/react": "export function useSession(){return {data:{user:{role:'ADMIN'}}}}",
  "next-intl": "export function useLocale(){return new URLSearchParams(location.search).get('lang')||'ar'}",
};
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {setDashLocale} from './lib/dashboard/i18n';import {CampaignsListClient} from './app/(dashboard)/dashboard/communication/campaigns/_components/CampaignsListClient';const locale=new URLSearchParams(location.search).get('lang')||'ar';setDashLocale(locale);document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(<main style={{padding:16}}><CampaignsListClient/></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fixture-navigation", setup(b) { b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : null); b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: process.cwd() })); } }] });
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: ["app/(dashboard)/dashboard/communication/**/*.tsx", "components/dashboard/**/*.tsx", "components/ui/**/*.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;
const fonts = { "/ar.woff2": await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2"), "/latin.woff2": await readFile("public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2") };
const id = "a".repeat(24); let missing = true, failRead = false, race = false, posts = 0, queued = 0;
const errors = [], unexpected = [];
const campaign = () => ({ id, name: "Fixture campaign", channel: "WHATSAPP", purpose: "MARKETING", status: queued ? "SENDING" : "BLOCKED", templateGroupId: "template", audienceSegmentKey: "list:fixture", sentCount: 4196, deliveredCount: 2508, readCount: 1207, clickedCount: 0, repliedCount: 25, failedCount: 1645, donationCount: null, revenue: null, createdAt: "2026-10-31T06:20:00Z", updatedAt: "2026-10-31T12:24:00Z", scheduledAt: null, metadata: { lastRun: { blocked: "LANGUAGE_COVERAGE_INCOMPLETE" }, sendProgress: { done: false } } });
const diagnostic = () => ({ status: "BLOCKED", lastBlocked: "LANGUAGE_COVERAGE_INCOMPLETE", blocked: missing ? "LANGUAGE_COVERAGE_INCOMPLETE" : null, canResume: !missing, coverage: { ok: !missing, undecided: missing ? ["fr", "de"] : [], missingWithRecipients: missing ? [{ locale: "fr", label: "Français", recipientCount: 41 }, { locale: "de", label: "Deutsch", recipientCount: 12 }] : [] }, controls: { dailyCap: 5000, paused: false }, progress: { batches: 2, scanned: 500, done: false } });
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture.test");
  const json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css + ':root{--background:0 0% 100%;--foreground:215 28% 17%;--primary:10 61% 40%;--primary-foreground:0 0% 100%;--border:214 25% 86%;--input:214 25% 86%;--ring:10 61% 40%;--radius:.75rem;}@font-face{font-family:Cairo;src:url(/ar.woff2);unicode-range:U+0600-06FF;}@font-face{font-family:Cairo;src:url(/latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Cairo,system-ui;background:#f8fafc}'); }
  if (fonts[url.pathname]) { response.setHeader("Content-Type", "font/woff2"); return response.end(fonts[url.pathname]); }
  if (url.pathname === "/api/communication/campaigns") {
    const row = campaign();
    if (url.searchParams.get("outcomesMode") === "poll") return setTimeout(() => json({ ok: true, outcomesReady: true, campaigns: [{ ...row, sentCount: 3571, failedCount: 1370, donationCount: 2, revenue: 23 }], unattributed: { donationCount: 0, revenue: 0, unpricedPaidCount: 0 } }), 100);
    return json({ ok: true, deliveryCountersReady: true, campaigns: [row], outcomesReady: false });
  }
  if (url.pathname === `/api/communication/campaigns/${id}/recovery`) {
    if (request.method === "GET") return json(failRead ? { ok: false, error: "DIAGNOSTIC_UNAVAILABLE" } : { ok: true, data: diagnostic() }, failRead ? 503 : 200);
    const body = await new Promise(resolve => { let text = ""; request.on("data", chunk => text += chunk); request.on("end", () => resolve(JSON.parse(text))); });
    assert.deepEqual(body, { confirm: true }); posts++;
    if (race) { missing = true; return json({ ok: false, error: "LANGUAGE_COVERAGE_INCOMPLETE", diagnostic: diagnostic() }, 409); }
    queued++; return json({ ok: true, data: { status: "SENDING", queued: true, providerCalls: 0 } });
  }
  if (url.pathname.startsWith("/api")) { unexpected.push(url.pathname); return json({ ok: false }, 404); }
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); let browser, checks = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    missing = true; failRead = false; race = false; posts = 0; queued = 0;
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.on("pageerror", e => { errors.push(e.message); console.error(e.stack); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${locale}`);
    const row = page.getByRole("row").filter({ hasText: "Fixture campaign" });
    await expect(row).toContainText("4,196"); await expect(row).toContainText("23"); await expect(row).not.toContainText("3,571"); checks++;
    failRead = true;
    await row.getByRole("button", { name: label(locale, "تشخيص واستكمال"), exact: true }).click();
    const dialog = page.getByRole("dialog"), confirm = dialog.getByRole("button", { name: label(locale, "تأكيد جدولة الاستكمال"), exact: true });
    await expect(dialog.getByRole("alert")).toContainText(label(locale, "تعذّر تحميل التشخيص. أعد المحاولة؛ لم تُرسل رسائل.")); await expect(confirm).toBeDisabled(); checks++;
    failRead = false; await dialog.getByRole("button", { name: label(locale, "إعادة الفحص"), exact: true }).click();
    await expect(dialog).toContainText("Français"); await expect(dialog).toContainText("Deutsch"); await expect(confirm).toBeDisabled(); checks++;
    assert.equal(posts, 0); checks++;
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.screenshot({ path: path.join(artifacts, `missing-${locale}-${width}.png`), fullPage: true, animations: "disabled" });
    const box = await dialog.boundingBox(); assert.ok(box.width <= width && box.x >= 0); checks++;
    missing = false;
    await dialog.getByRole("button", { name: label(locale, "إعادة الفحص"), exact: true }).click(); await expect(confirm).toBeEnabled(); await expect(dialog).not.toContainText("Français"); checks++;
    race = true; await confirm.click(); await expect(confirm).toBeDisabled(); await expect(dialog).toContainText("Français"); assert.equal(queued, 0); checks++;
    missing = false; race = false; await dialog.getByRole("button", { name: label(locale, "إعادة الفحص"), exact: true }).click(); await expect(confirm).toBeEnabled();
    await confirm.click(); await expect(dialog).toHaveCount(0); await expect(row).toContainText(label(locale, "جاري الإرسال")); assert.equal(posts, 2); assert.equal(queued, 1); checks++;
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ checks, languages: ["ar", "en", "tr"], widths: [390, 1440], productionWrites: 0, recipientMessages: 0, errors }));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
