// Real tracking/settings/template components, local fixtures only; no provider requests.
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
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts", "performance-tracking");
await mkdir(artifacts, { recursive: true });
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const label = (locale, key) => locale === "ar" ? key : dictionaries[locale][key] || key;
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{setDashLocale}from'./lib/dashboard/i18n';import Settings from './app/(dashboard)/dashboard/platform-connections/tracking/_components/TrackingSettingsManager';import{WhatsappTemplateEditorDialog}from'./app/(dashboard)/dashboard/templates/_components/WhatsappTemplateEditorDialog';import TrackingPixels from './components/TrackingPixels';const p=new URLSearchParams(location.search);const locale=p.get('lang')||'ar';setDashLocale(locale);document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';createRoot(document.getElementById('root')).render(p.has('pixels')?<TrackingPixels><button>Interact</button></TrackingPixels>:p.has('editor')?<WhatsappTemplateEditorDialog id={'a'.repeat(24)} initialKind='CAMPAIGN' open onOpenChange={v=>{window.fixtureClosed=!v}}/>:<main style={{padding:16}}><Settings canManage canTest/></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' } });
const baseCss = (await readFile("app/[locale]/globals.css", "utf8")).replace(/^@config[^;]+;\s*/, "");
const font = await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2");
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: ["app/(dashboard)/dashboard/templates/**/*.tsx", "app/(dashboard)/dashboard/platform-connections/tracking/**/*.tsx", "components/ui/**/*.tsx"] })]).process(baseCss, { from: undefined })).css + "@font-face{font-family:Cairo;src:url(/fixture.woff2)}:root{--font-cairo:Cairo;--font-montserrat:Arial}";
const id = "a".repeat(24);
const source = { id, name: "fixture_original", body: "Hello {{1}}", category: "MARKETING", header: { type: "NONE" }, buttons: [{ type: "URL", text: "Donate", url: "https://minberiaksa.org/ar/bagislar?utm_campaign=shared" }, { type: "QUICK_REPLY", text: "إيقاف" }], submittedLocales: ["ar", "en", "tr"], translations: Object.fromEntries(["en", "tr"].map(locale => [locale, { body: "Hello {{1}}", buttons: [{ type: "URL", text: "Donate", url: `https://minberiaksa.org/${locale}/bagislar?language={{1}}` }, { type: "QUICK_REPLY", text: "STOP" }] }])) };
let settings = {}, writes = [], templateWrites = [], configReads = 0;
const errors = [], unexpected = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture.local");
  const json = value => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
  const body = () => new Promise(resolve => { let text = ""; request.on("data", chunk => text += chunk); request.on("end", () => resolve(JSON.parse(text))); });
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/fixture.woff2") { response.setHeader("Content-Type", "font/woff2"); return response.end(font); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
  if (url.pathname === "/api/admin/tracking/diagnostics") return json({ ok: true, diagnostics: {} });
  if (url.pathname === "/api/admin/tracking") {
    if (request.method === "PUT") { const data = await body(); writes.push(data); settings = { ...settings, ...data }; }
    return json(settings);
  }
  if (url.pathname === "/api/tracking/config") { configReads++; return json({ gaMeasurementId: "G-FIXTURE", googleAdsTargets: [{ conversionId: "AW-123", conversionLabel: "paid" }, { conversionId: "AW-456", conversionLabel: "grant" }], ...settings }); }
  if (url.pathname === `/api/templates/whatsapp/${id}`) {
    assert.equal(request.method, "GET", "an approved template must never be patched by the copy action");
    return json({ template: source });
  }
  if (url.pathname === "/api/templates/whatsapp" && request.method === "POST") { templateWrites.push(await body()); return json({ template: { id: "b".repeat(24) }, publish: { targets: 3, statuses: [] } }); }
  if (url.pathname.startsWith("/api")) { unexpected.push(url.pathname); response.statusCode = 404; return json({ ok: false }); }
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser, checks = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    settings = {}; writes = []; templateWrites = [];
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    await page.goto(`${base}/?lang=${locale}`);
    await page.getByLabel(label(locale, "معرّف حاوية GTM"), { exact: true }).fill("GTM-FIXTURE");
    await page.getByLabel(label(locale, "تفعيل حاوية Google Tag Manager"), { exact: true }).check();
    await page.getByRole("button", { name: label(locale, "حفظ الإعدادات"), exact: true }).first().click();
    await expect.poll(() => writes.length).toBe(1);
    assert.equal(writes[0].googleTagManagerId, "GTM-FIXTURE"); assert.equal(writes[0].googleTagManagerEnabled, true); checks++;
    await page.reload(); await expect(page.getByLabel(label(locale, "تفعيل حاوية Google Tag Manager"), { exact: true })).toBeChecked(); checks++;
    // New Clarity card is an actual editable saved setting, not a decorative input.
    await page.getByLabel("Project ID", { exact: true }).fill("U60R8ZHRZH");
    await page.getByLabel(label(locale, "تفعيل Microsoft Clarity على صفحات الموقع العامة"), { exact: true }).check();
    await page.getByRole("button", { name: label(locale, "حفظ الإعدادات"), exact: true }).first().click();
    await expect.poll(() => writes.length).toBe(2);
    assert.equal(writes[1].clarityEnabled, true);
    assert.equal(writes[1].clarityProjectId, "U60R8ZHRZH"); checks++;
    await page.reload();
    await expect(page.getByLabel("Project ID", { exact: true })).toHaveValue("U60R8ZHRZH");
    await expect(page.getByLabel(label(locale, "تفعيل Microsoft Clarity على صفحات الموقع العامة"), { exact: true })).toBeChecked(); checks++;
    // Read-only inspection checks public settings, not provider recordings.
    await page.getByRole("button", { name: label(locale, "مطابقة الإعداد العام المحفوظ"), exact: true }).click();
    await expect.poll(() => configReads).toBeGreaterThan(0); checks++;
    await page.screenshot({ path: path.join(artifacts, `connections-${locale}-${width}.png`), fullPage: true, animations: "disabled" });
    await page.getByLabel(label(locale, "تفعيل Microsoft Clarity على صفحات الموقع العامة"), { exact: true }).uncheck();
    await page.getByRole("button", { name: label(locale, "حفظ الإعدادات"), exact: true }).first().click();
    await expect.poll(() => writes.length).toBe(3);
    assert.equal(writes.at(-1).clarityEnabled, false); checks++;
    await page.reload();
    await expect(page.getByLabel(label(locale, "تفعيل Microsoft Clarity على صفحات الموقع العامة"), { exact: true })).not.toBeChecked(); checks++;
    await page.goto(`${base}/?editor=1&lang=${locale}`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: label(locale, "إعداد نسخة بتتبع إيرادات الحملات"), exact: true }).click();
    assert.equal(templateWrites.length, 0); checks++;
    await dialog.getByRole("button", { name: label(locale, "حفظ وإرسال إلى Meta"), exact: true }).click();
    await expect.poll(() => templateWrites.length).toBe(1);
    const saved = templateWrites[0]; assert.match(saved.name, /^fixture_original_tracked_/);
    assert.ok(saved.buttons[0].url.endsWith("utm_id={{1}}"));
    for (const code of ["en", "tr"]) { assert.ok(saved.translations[code].buttons[0].url.includes(`/${code}/bagislar?language=${code}`)); assert.ok(saved.translations[code].buttons[0].url.endsWith("utm_id={{1}}")); }
    assert.equal(source.buttons[0].url, "https://minberiaksa.org/ar/bagislar?utm_campaign=shared"); checks++;
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.screenshot({ path: path.join(artifacts, `copy-${locale}-${width}.png`), fullPage: true, animations: "disabled" });
    const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.width <= width); checks++;
    await page.close();
  }
  for (const pathname of ["/", "/tr/success/fixture", "/ar/donation-failed/fixture"]) {
    const page = await browser.newPage(); const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => { if (!route.request().url().startsWith("https://")) return route.continue(); requests.push(route.request().url()); return route.fulfill({ contentType: "text/javascript", body: "/* fixture: no provider call */" }); });
    settings = {}; configReads = 0;
    await page.goto(`${base}${pathname}?pixels=1`);
    if (pathname === "/") { assert.equal(configReads, 0); await page.getByRole("button", { name: "Interact" }).click(); }
    try { await expect.poll(() => requests.filter(url => url.includes("/gtag/js")).length).toBe(1); }
    catch (error) { console.error(JSON.stringify({ pathname, configReads, requests, errors, dom: await page.evaluate(() => ({ scripts: [...document.scripts].map(script => script.src), data: window.dataLayer })) })); throw error; }
    assert.equal(requests.some(url => /gtm\.js|contentsquare/.test(url)), false); checks++;
    const commands = await page.evaluate(() => window.dataLayer.map(value => Array.from(value)));
    assert.equal(commands.filter(value => value[0] === "config").length, 3); checks++;
    await page.close();
  }
  // With GTM active, the application must not also load a direct gtag.js.
  {
    settings = { googleTagManagerId: "GTM-FIXTURE", googleTagManagerEnabled: true };
    const page = await browser.newPage();
    const requests = [];
    await page.route("**/*", route => {
      if (!route.request().url().startsWith("https://")) return route.continue();
      requests.push(route.request().url());
      return route.fulfill({ contentType: "text/javascript", body: "/* synthetic tag */" });
    });
    await page.goto(`${base}/?pixels=1`);
    await page.getByRole("button", { name: "Interact" }).click();
    await expect.poll(() => requests.filter(url => url.includes("/gtm.js")).length).toBe(1);
    assert.equal(requests.filter(url => url.includes("/gtag/js")).length, 0);
    assert.equal(await page.evaluate(() => window.dataLayer.filter(item => item?.event === "gtm.js").length), 1);
    checks++;
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ checks, locales: ["ar", "en", "tr"], widths: [390, 1440], providerCalls: 0, recipientMessages: 0, artifacts }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
