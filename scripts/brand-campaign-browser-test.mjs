import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url), id = "507f1f77bcf86cd799439011";
const { clipSeoDescription } = require("../lib/seo-description.ts");
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const ui = (locale, text) => locale === "ar" ? text : dictionaries[locale][text] || text;
const locales = ["ar", "tr", "en", "fr", "de", "es", "id", "pt", "ur", "sq", "it", "nl", "sv", "no", "da", "ms", "ja", "zh", "hi"];
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor", "brand-campaign");
await mkdir(artifacts, { recursive: true });
const bundle = await build({ stdin: { contents: `import React,{useState} from "react";import {createRoot} from "react-dom/client";import {Toaster} from "react-hot-toast";import {setDashLocale} from "./lib/dashboard/i18n";import SignIn from "./app/[locale]/auth/signin/page";import AuthLayout from "./app/[locale]/auth/layout";import {SeoWorkspace} from "./components/dashboard/content-editor/SeoWorkspace";import {CampaignRowActions} from "./app/(dashboard)/dashboard/communication/campaigns/_components/CampaignRowActions";const q=new URLSearchParams(location.search),locale=q.get("lang")||"ar";setDashLocale(["ar","en","tr"].includes(locale)?locale:"ar");document.documentElement.lang=locale;document.documentElement.dir=["ar","ur"].includes(locale)?"rtl":"ltr";const initial={id:"${id}",name:"Fixture campaign",channel:q.get("channel")||"EMAIL",status:q.get("status")||"DRAFT",purpose:"MARKETING",sentCount:0,deliveredCount:0,readCount:0,failedCount:0,repliedCount:0,clickedCount:0,donationCount:0,revenue:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};function SeoFixture(){const dense=["ja","zh"].includes(locale),sentence=dense?"エルサレム旧市街の住宅修復を支援します。":"Support the restoration of family homes in Jerusalem. ",description=sentence.repeat(q.get("short")?1:12);return <main className="p-4"><SeoWorkspace locale={locale} values={{metaTitle:"Restoration",metaDescription:description}} fields={[]} renderField={()=>null} onChange={()=>{}}/></main>}function CampaignFixture(){const [row,setRow]=useState(initial);return <main className="p-8">{row?<><h1>{row.name}</h1><p>{row.status}</p><CampaignRowActions campaign={row} onChanged={()=>fetch("/api/communication/campaigns/${id}").then(r=>r.json()).then(d=>setRow(d.campaign))}/></>:<p>Deleted</p>}<Toaster/></main>}async function mount(){createRoot(document.getElementById("root")).render(q.get("surface")==="signin"?await AuthLayout({params:Promise.resolve({locale}),children:<SignIn/>}):q.get("surface")==="seo"?<SeoFixture/>:<CampaignFixture/>)}mount();`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", banner: { js: 'globalThis.process={env:{NODE_ENV:"test"}};' }, write: false, jsx: "automatic", tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fixture-adapters", setup(builder) {
  builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/i18n\/routing$/ }, () => ({ path: "routing", namespace: "fixture" }));
  builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "image" ? 'import React from "react";export default function Image({priority,quality,fill,...props}){return React.createElement("img",props)}' : args.path === "routing" ? 'import React from "react";import {useLocale} from "next-intl";export function Link({href,...props}){return React.createElement("a",{...props,href:"/"+useLocale()+href})}' : 'export function useParams(){return {locale:new URLSearchParams(location.search).get("lang")||"ar"}};export function useRouter(){return {push(){},refresh(){}}};export function useSearchParams(){return new URLSearchParams(location.search)};export function usePathname(){return location.pathname}', loader: "js", resolveDir: process.cwd() }));
} }] });
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: [{ raw: await readFile("app/[locale]/auth/signin/page.tsx", "utf8"), extension: "tsx" }, "app/(dashboard)/dashboard/communication/campaigns/**/*.tsx", "components/dashboard/**/*.tsx", "components/ui/*.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;
const theme = (await readFile("app/[locale]/globals.css", "utf8")).match(/:root\s*\{[\s\S]*?\}/)?.[0] || "";
const files = {
  "/brand/minber-logo-full.webp": { type: "image/webp", data: await readFile("public/brand/minber-logo-full.webp") },
  "/icon.png": { type: "image/png", data: await readFile("app/icon.png") },
  "/favicon.ico": { type: "image/x-icon", data: await readFile("app/favicon.ico") },
  "/ar.woff2": { type: "font/woff2", data: await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2") },
  "/latin.woff2": { type: "font/woff2", data: await readFile("public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2") },
};
let campaign = null, writes = [], deleteFails = false;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture"), json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css + theme + '@font-face{font-family:Cairo;src:url(/ar.woff2);unicode-range:U+0600-06FF;}@font-face{font-family:Cairo;src:url(/latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Cairo,system-ui;margin:0;background:#f8fafc}'); }
  if (files[url.pathname]) { response.setHeader("Content-Type", files[url.pathname].type); return response.end(files[url.pathname].data); }
  if (url.pathname.startsWith("/api")) {
    if (url.pathname === "/api/auth/google-config") return json({ clientId: null });
    if (request.method === "GET") return json({ ok: true, campaign });
    let raw = ""; for await (const chunk of request) raw += chunk; writes.push({ method: request.method, body: raw ? JSON.parse(raw) : null });
    if (request.method === "DELETE") { if (deleteFails) return json({ ok: false, error: "DB_UNAVAILABLE" }, 503); campaign = null; return json({ ok: true, deleted: true, archived: false }); }
    if (url.pathname.endsWith("/transition")) { campaign.status = "APPROVED"; return json({ ok: true, campaign }); }
    return json({ error: "UNEXPECTED_FIXTURE_REQUEST" }, 404);
  }
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="icon" href="/icon.png"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
let browser, checks = 0; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const locale of locales) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 930 } }); page.on("pageerror", error => { errors.push(error.message); console.error("Browser fixture:", error.stack); });
    const messages = require(`../i18n/messages/${locale}.json`);
    await page.route("https://accounts.google.com/**", route => route.abort());
    await page.goto(`${origin}/?surface=signin&lang=${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.SignInPage.title);
    assert.equal(await page.locator("body").innerText().then(text => text.includes("SignInPage.")), false); checks++;
    await expect(page.getByRole("button", {name: messages.SignInPage.signInWithGoogle, exact:true})).toBeVisible();
    const image = page.getByRole("img").first(); await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 2603)).toBe(true);
    const box = await image.boundingBox(); assert.ok(box.width > (width < 500 ? 250 : 300)); assert.ok(Math.abs(box.width / box.height - 2603 / 633) < 0.1); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); checks++;
    if (["ar", "en", "tr"].includes(locale)) await page.screenshot({ path: path.join(artifacts, `signin-${locale}-${width}.png`), fullPage: true });
    await page.close();
  }
  for (const locale of ["ar", "en", "ja", "zh"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 930 } });
    page.on("pageerror", error => errors.push(error.message));
    const sentence = ["ja", "zh"].includes(locale) ? "エルサレム旧市街の住宅修復を支援します。" : "Support the restoration of family homes in Jerusalem. ";
    for (const short of [false, true]) {
      await page.goto(`${origin}/?surface=seo&lang=${locale}${short ? "&short=1" : ""}`);
      const published = clipSeoDescription(sentence.repeat(short ? 1 : 12), locale);
      await expect(page.getByText(published, { exact: true })).toBeVisible();
      if (short) await expect(page.getByRole("status")).toHaveCount(0);
      else await expect(page.getByRole("status")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); checks++;
    }
    await page.close();
  }
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) for (const channel of ["EMAIL", "WHATSAPP", "SMS"]) {
    const page = await browser.newPage({ viewport: { width, height: 930 } }); page.on("pageerror", error => { errors.push(error.message); console.error("Browser fixture:", error.stack); });
    await page.context().addCookies([{ name: "dash-locale", value: locale, url: origin }]);
    for (const status of ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "CANCELLED"]) {
      writes = []; campaign = { id, name: "Fixture campaign", channel, status, sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0, clickedCount: 0 };
      await page.goto(`${origin}/?lang=${locale}&channel=${channel}&status=${status}`);
      await page.getByRole("button", { name: ui(locale, "إجراءات حملة {0}").replace("{0}", "Fixture campaign") }).click();
      await page.getByRole("menuitem", { name: ui(locale, "حذف الحملة التي لم تُرسل") }).click();
      const dialog = page.getByRole("alertdialog"); await expect(dialog).toContainText("Fixture campaign");
      await dialog.getByRole("button", { name: ui(locale, "إلغاء"), exact: true }).click(); assert.equal(writes.length, 0); checks++;
      await page.getByRole("button", { name: ui(locale, "إجراءات حملة {0}").replace("{0}", "Fixture campaign") }).click();
      await page.getByRole("menuitem", { name: ui(locale, "حذف الحملة التي لم تُرسل") }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: ui(locale, "حذف الحملة"), exact: true }).click(); await expect(page.getByText("Deleted", { exact: true })).toBeVisible();
      assert.equal(writes.length, 1); assert.equal(writes[0].method, "DELETE"); checks++;
    }
    campaign = { id, name: "Fixture campaign", channel, status: "DRAFT", sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0, clickedCount: 0 };
    writes = []; deleteFails = true; await page.goto(`${origin}/?lang=${locale}&channel=${channel}&status=DRAFT`);
    const actions = page.getByRole("button", { name: ui(locale, "إجراءات حملة {0}").replace("{0}", "Fixture campaign") });
    await actions.click(); await page.getByRole("menuitem", { name: ui(locale, "حذف الحملة التي لم تُرسل") }).click(); await page.getByRole("alertdialog").getByRole("button", { name: ui(locale, "حذف الحملة"), exact: true }).click(); await expect(page.getByText("DB_UNAVAILABLE")).toBeVisible(); await expect(actions).toBeVisible(); checks++;
    deleteFails = false;
    await actions.click(); await page.getByRole("menuitem", { name: ui(locale, "تأكيد الحملة"), exact: true }).click(); await expect(page.getByText("APPROVED", { exact: true })).toBeVisible(); assert.equal(writes.at(-1).body.action, "CONFIRM"); checks++;
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "summary.json"), JSON.stringify({ fixtureOnly: true, checks, authLocales: locales.length, campaignChannels: 3, widths: [390, 1440], providerCalls: 0, errors }, null, 2));
  console.log(JSON.stringify({ fixtureOnly: true, checks, authLocales: locales.length, providerCalls: 0, errors }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
