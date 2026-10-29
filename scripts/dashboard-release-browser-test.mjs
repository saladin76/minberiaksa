// Real components with isolated HTTP fixtures; never contacts production or a provider.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import assert from "node:assert/strict";
import path from "node:path";
const require = createRequire(import.meta.url), id = "a".repeat(24), second = "b".repeat(24);
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const ui = (locale, key) => locale === "ar" ? key : dictionaries[locale][key] || key;
const artifacts = path.resolve(".artifacts/dashboard-release"); await mkdir(artifacts, { recursive: true });
const bundle = await build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {setDashLocale} from './lib/dashboard/i18n';import {ProjectFilterOrderDialog} from './components/dashboard/ProjectFilterOrderDialog';import {GoogleSearchAccounts} from './components/dashboard/GoogleSearchAccounts';import {CreateDonationDialog} from './components/dashboard/donations/CreateDonationDialog';import ProjectsPage from './components/minbar/projects/ProjectsPage';import DeferredPhoto from './components/minbar/DeferredPhoto';const q=new URLSearchParams(location.search),locale=q.get('lang')||'ar';setDashLocale(locale);document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.documentElement.lang=locale;const projects=[{id:'${id}',title:'Project A'},{id:'${second}',title:'Project B'}];const filters=[{key:'programme:${second}',id:'${second}',kind:'programme',name:'Major project',slug:'major',icon:'landmark',order:0,projectIds:['${second}']},{key:'category:${id}',id:'${id}',kind:'category',name:'Category',slug:'category',icon:'HeartHandshake',order:1,projectIds:['${id}']},{key:'category:empty',id:'empty',kind:'category',name:'Empty category',slug:'empty',icon:'layout-grid',order:2,projectIds:[]}];function App(){const [open,setOpen]=useState(true);return <main style={{padding:16}}>{q.get('surface')==='order'?<ProjectFilterOrderDialog locale={locale}/>:q.get('surface')==='accounts'?<GoogleSearchAccounts onChanged={()=>{}}/>:q.get('surface')==='donation'?(open?<CreateDonationDialog onClose={()=>setOpen(false)} onCreated={()=>{}}/>:<p>Created</p>):q.get('surface')==='deferred'?<><div style={{height:3000}}/><div id='photo' style={{position:'relative',height:200,width:300}}><DeferredPhoto src='/deferred.svg' label='Deferred photo' width={400}/></div></>:<ProjectsPage projects={projects} filters={filters} slides={[]}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" }, banner: { js: 'globalThis.process={env:{NODE_ENV:"test"}};' }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, plugins: [{ name: "fixtures", setup(builder) {
  builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "image" }));
  builder.onLoad({ filter: /.*/, namespace: "image" }, () => ({ contents: 'import React from "react";export default function Image({src,alt}){return <img src={src} alt={alt}/>}', loader: "tsx", resolveDir: process.cwd() }));
  builder.onResolve({ filter: /^next-intl$/ }, () => ({ path: "intl", namespace: "intl" }));
  builder.onLoad({ filter: /.*/, namespace: "intl" }, () => ({ contents: 'export function useTranslations(){return key=>key};export function useLocale(){return new URLSearchParams(location.search).get("lang")||"ar"}', loader: "js" }));
  builder.onResolve({ filter: /^@\/components\/minbar\/(ProjectDonateCard|banners\/)/ }, args => ({ path: args.path, namespace: "light" }));
  builder.onResolve({ filter: /^\.\/ProjectsHero$/ }, args => ({ path: args.path, namespace: "light" }));
  builder.onLoad({ filter: /.*/, namespace: "light" }, args => ({ contents: args.path.endsWith("ProjectDonateCard") ? 'import React from "react";export default function Card({project}){return <article data-project-id={project.id}>{project.title}</article>}' : 'export default function Empty(){return null}', loader: "tsx", resolveDir: process.cwd() }));
} }] });
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: ["components/dashboard/**/*.tsx", "components/ui/*.tsx", "components/minbar/projects/*.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css + await readFile("styles/minbar/minbar.css", "utf8");
const theme = (await readFile("app/[locale]/globals.css", "utf8")).match(/:root\s*\{[\s\S]*?\}/)?.[0] || "";
const fonts = { "/ar.woff2": await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2"), "/latin.woff2": await readFile("public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2") };
const requests = [], errors = []; let orderFailure = false, donationFailure = true, photoRequests = 0;
const accounts = [{ id, name: "Paid account", customerId: "1234567890", managerId: "", clientId: "saved-client", fundingType: "PAID", enabled: true, revision: "r".repeat(64), status: "ACTIVE", lastTestAt: null, secrets: { clientSecret: true, refreshToken: true, developerToken: true } }, { id: second, name: "Grant account", customerId: "0987654321", managerId: "", clientId: "grant-client", fundingType: "AD_GRANTS", enabled: true, revision: "s".repeat(64), status: "ACTIVE", lastTestAt: null, secrets: { clientSecret: true, refreshToken: true, developerToken: true } }];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture");
  const json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css + theme + '@font-face{font-family:Cairo;src:url(/ar.woff2);unicode-range:U+0600-06FF;}@font-face{font-family:Cairo;src:url(/latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Cairo,system-ui;background:#f8fafc}'); }
  if (fonts[url.pathname]) { response.setHeader("Content-Type", "font/woff2"); return response.end(fonts[url.pathname]); }
  if (url.pathname === "/deferred.svg") { photoRequests++; response.setHeader("Content-Type", "image/svg+xml"); return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#267"/></svg>'); }
  let body = {}; if (request.method !== "GET") { let raw = ""; for await (const chunk of request) raw += chunk; body = JSON.parse(raw || "{}"); }
  if (url.pathname.startsWith("/api")) requests.push({ path: url.pathname, method: request.method, body });
  if (url.pathname === "/api/admin/project-filters") return request.method === "PUT" ? json(orderFailure ? { error: "ORDER_CHANGED" } : { ok: true }, orderFailure ? 409 : 200) : json({ revision: "r".repeat(64), items: [{ key: `category:${id}`, kind: "category", name: "Category" }, { key: `programme:${second}`, kind: "programme", name: "Major project" }] });
  if (url.pathname === "/api/admin/google-search/accounts") {
    if (request.method === "GET") return json({ accounts });
    if (body.action === "test") return json({ ok: true, currency: "USD", timezone: "Europe/Istanbul" });
    const item = accounts.find(row => row.id === body.id); if (item) Object.assign(item, { name: body.name, fundingType: body.fundingType }); return json({ ok: true, id: body.id || id });
  }
  if (url.pathname === "/api/campaigns") return json({ items: [{ id, title: "Project A" }], hasMore: false });
  if (url.pathname === "/api/categories") return json({ items: [] });
  if (url.pathname === "/api/admin/donations") return json(donationFailure ? { error: "FX_UNAVAILABLE", code: "MANUAL_DONATION_FX_UNAVAILABLE" } : { donationId: id }, donationFailure ? 503 : 201);
  if (url.pathname.startsWith("/api")) return json({ error: "UNEXPECTED_FIXTURE_REQUEST" }, 404);
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`; let browser, checks = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(12000); page.on("pageerror", error => { errors.push(error.message); console.error("Fixture error", error.stack); }); await page.context().addCookies([{ name: "dash-locale", value: locale, url: origin }]);
    const open = surface => page.goto(`${origin}/?surface=${surface}&lang=${locale}`, { waitUntil: "domcontentloaded" });
    await open("order"); await page.getByRole("button", { name: ui(locale, "ترتيب فلاتر صفحة المشاريع"), exact: true }).click(); const dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton").first().waitFor(); const position = dialog.getByRole("spinbutton").first(); await position.fill("2"); await position.press("Enter");
    assert.equal(await dialog.locator("li").first().locator("span.font-medium").textContent(), "Major project"); checks++;
    orderFailure = true; await dialog.getByRole("button", { name: ui(locale, "حفظ الترتيب"), exact: true }).click(); await dialog.getByRole("alert").waitFor(); assert.equal(await dialog.locator("li").first().locator("span.font-medium").textContent(), "Major project"); checks++;
    orderFailure = false; await dialog.getByRole("button", { name: ui(locale, "حفظ الترتيب"), exact: true }).click(); await dialog.getByRole("status").waitFor(); assert.deepEqual(requests.filter(row => row.method === "PUT").at(-1).body.keys, [`programme:${second}`, `category:${id}`]); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); await page.screenshot({ path: path.join(artifacts, `${locale}-order-${width}.png`), fullPage: true }); checks++;
    await open("accounts"); await page.getByRole("button", { name: ui(locale, "إدارة حسابات Google Ads"), exact: true }).click(); await page.getByRole("button").filter({ hasText: "Grant account" }).click();
    await expect(page.getByLabel("Customer ID", { exact: true })).toBeDisabled(); assert.equal(await page.getByLabel(ui(locale, "نوع تمويل الحساب")).inputValue(), "AD_GRANTS"); assert.equal(await page.getByLabel("Client Secret", { exact: true }).inputValue(), ""); checks++;
    await page.getByLabel(ui(locale, "اسم الحساب"), { exact: true }).fill("Grant renamed"); await page.getByRole("button", { name: ui(locale, "حفظ الحساب"), exact: true }).click(); await page.getByRole("status").waitFor();
    const saved = requests.filter(row => row.path.endsWith("accounts") && row.body.action === "save").at(-1).body; assert.equal(saved.id, second); assert.equal(saved.clientSecret, ""); assert.equal(saved.fundingType, "AD_GRANTS"); checks++;
    await page.getByRole("button", { name: ui(locale, "اختبار الاتصال المحفوظ"), exact: true }).click(); await expect(page.getByRole("status")).toContainText("USD"); assert.equal(requests.at(-1).path, "/api/admin/google-search/accounts"); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); await page.screenshot({ path: path.join(artifacts, `${locale}-accounts-${width}.png`), fullPage: true }); checks++;
    accounts[1].name = "Grant account";
    await open("catalogue"); await page.locator('[data-filter-key="programme:' + second + '"]').click(); await expect(page.locator("[data-project-id]")).toHaveCount(1); assert.equal(await page.locator("[data-project-id]").getAttribute("data-project-id"), second); checks++;
    await page.locator('[data-filter-key="category:' + id + '"]').click(); assert.equal(await page.locator("[data-project-id]").getAttribute("data-project-id"), id); checks++;
    await page.locator('[data-filter-key="category:empty"]').click(); await expect(page.locator("[data-project-id]")).toHaveCount(0); checks++;
    await open("donation"); await page.getByRole("button", { name: ui(locale, "متبرع جديد"), exact: true }).click();
    await page.getByPlaceholder(ui(locale, "مثال: أحمد محمد"), { exact: true }).fill("Offline fixture donor");
    await page.getByLabel(ui(locale, "دولة المتبرع"), { exact: true }).selectOption("EG");
    await page.getByRole("combobox", { name: ui(locale, "مصدر التبرع"), exact: true }).click(); await page.getByRole("option", { name: ui(locale, "نقدي / كاش"), exact: true }).click();
    await page.getByRole("combobox").last().click(); await page.getByRole("option", { name: "Project A", exact: true }).click(); await page.getByRole("spinbutton").last().fill("10");
    donationFailure = true; await page.getByRole("button", { name: ui(locale, "تسجيل التبرع"), exact: true }).click(); await page.getByRole("button", { name: ui(locale, "نعم، سجّل التبرع"), exact: true }).click(); await page.getByRole("alert").filter({ hasText: ui(locale, "سعر الصرف غير متاح مؤقتًا. بياناتك محفوظة هنا؛ أعد المحاولة بعد قليل.") }).waitFor();
    const attempted = requests.filter(row => row.path === "/api/admin/donations").at(-1).body; assert.equal(attempted.provider, "CASH"); assert.equal(attempted.donorCountryCode, "EG"); assert.match(attempted.requestId, /^[a-f0-9]{24}$/); checks++;
    assert.equal(await page.getByPlaceholder(ui(locale, "مثال: أحمد محمد"), { exact: true }).inputValue(), "Offline fixture donor"); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); await page.screenshot({ path: path.join(artifacts, `${locale}-donation-${width}.png`), fullPage: true }); checks++;
    donationFailure = false; await page.getByRole("button", { name: ui(locale, "تسجيل التبرع"), exact: true }).click(); await page.getByRole("button", { name: ui(locale, "نعم، سجّل التبرع"), exact: true }).click(); await page.getByText("Created", { exact: true }).waitFor();
    assert.equal(requests.filter(row => row.path === "/api/admin/donations").at(-1).body.requestId, attempted.requestId); checks++;
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.goto(`${origin}/?surface=deferred`); await page.waitForTimeout(150); assert.equal(photoRequests, 0); checks++;
  await page.locator("#photo").scrollIntoViewIfNeeded(); await expect.poll(() => photoRequests).toBe(1); checks++;
  assert.deepEqual(errors, []); console.log(`Dashboard release browser checks: ${checks} passed`); await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ checks, passed: true, errors }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
