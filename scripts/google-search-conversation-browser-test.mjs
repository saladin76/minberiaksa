import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
const id = "507f1f77bcf86cd799439011";
const dictionaries = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const ui = (locale, text) => locale === "ar" ? text : dictionaries[locale][text] || text;
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor", "google-search-conversation");
await mkdir(artifacts, { recursive: true });
const bundle = await build({ stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import {setDashLocale} from "./lib/dashboard/i18n";import {GoogleSearchManager} from "./app/(dashboard)/dashboard/marketing/google-search/GoogleSearchManager";const locale=new URLSearchParams(location.search).get("lang")||"ar";setDashLocale(locale);document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";createRoot(document.getElementById("root")).render(<main style={{padding:16}}><GoogleSearchManager/></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: path.resolve("tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "local-next-link", setup(builder) {
  builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react";export default function Link(props){return React.createElement("a",props,props.children)}', loader: "js", resolveDir: process.cwd() }));
} }] });
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: ["components/dashboard/**/*.tsx", "components/ui/*.tsx", "app/(dashboard)/dashboard/marketing/google-search/*.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;
const theme = (await readFile("app/[locale]/globals.css", "utf8")).match(/:root\s*\{[\s\S]*?\}/)?.[0] || "";
const fonts = { "/ar.woff2": await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2"), "/latin.woff2": await readFile("public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2") };
const originalRequest = { connectionId: id, prompt: "Winter fixture", locales: ["en"], countries: ["TR"], projectIds: [id], dailyBudget: 10, containsEuPoliticalAdvertising: false };
const accounts = [{ id, name: "Fixture Google account", customerId: "1234567890", ready: true, enabled: true }];
let plan, scenario = "draft", writes = [];
function reset() {
  writes = []; plan = { id, title: "Winter fixture", version: 1, status: scenario === "active" ? "ACTIVE" : "DRAFT", request: structuredClone(originalRequest), proposal: { summary: "A measured winter proposal", campaigns: [], expansion: [] }, evidence: { report: { currency: "USD", timezone: "Europe/Istanbul" }, conversation: [] }, automationEnabled: false };
}
reset();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture"), json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); return response.end(css + theme + '@font-face{font-family:Cairo;src:url(/ar.woff2);unicode-range:U+0600-06FF;}@font-face{font-family:Cairo;src:url(/latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Cairo,system-ui;background:#f8fafc}'); }
  if (fonts[url.pathname]) { response.setHeader("Content-Type", "font/woff2"); return response.end(fonts[url.pathname]); }
  if (url.pathname === "/api/admin/google-search/accounts") return json({ accounts: [] });
  if (url.pathname === "/api/admin/google-search") {
    if (request.method === "GET") return url.searchParams.has("id") ? json({ plan }) : json({ accounts, projects: [{ id, title: "Winter project" }], plans: [{ ...plan, connectionId: id }] });
    let raw = ""; for await (const chunk of request) raw += chunk; const body = JSON.parse(raw); writes.push(body);
    if (body.version !== plan.version) return json({ error: "PLAN_CHANGED_RELOAD" }, 409);
    plan.version++;
    if (body.action === "chat") plan.evidence.conversation.push({ requestId: body.requestId, planVersion: plan.version, at: new Date().toISOString(), user: body.message, assistant: { reply: "Fixture assistant response", recommendation: scenario === "active" ? "budget" : "replan", suggestedDailyBudget: scenario === "active" ? 24 : null } });
    if (body.action === "revise") { plan.request.prompt += "\n\n" + body.refinement; plan.status = "DRAFT"; }
    if (body.action === "budget") plan.request.dailyBudget = body.newDailyBudget;
    if (body.action === "automation") { plan.automationEnabled = body.policy.enabled; plan.automationPolicy = body.policy; }
    return json({ plan });
  }
  if (url.pathname.startsWith("/api")) return json({ error: "UNEXPECTED_FIXTURE_REQUEST" }, 404);
  response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, checks = 0; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.context().addCookies([{ name: "dash-locale", value: locale, url: origin }]);
    const open = async state => { scenario = state; reset(); await page.goto(`${origin}/?lang=${locale}`); await page.getByRole("button", { name: /Winter fixture/ }).click(); await page.getByRole("textbox", { name: ui(locale, "رسالتك للمساعد") }).waitFor(); };
    await open("draft");
    const chat = page.getByRole("region", { name: ui(locale, "محادثة خطة Google Search") });
    await chat.getByRole("textbox").fill("Improve the winter copy"); await chat.getByRole("button", { name: ui(locale, "إرسال للمساعد") }).click();
    await expect(chat.getByRole("log")).toContainText("Fixture assistant response");
    assert.equal(writes[0].action, "chat"); assert.equal(writes[0].version, 1); checks++;
    await chat.getByRole("button", { name: ui(locale, "مراجعة تنقيح المسودة") }).click();
    let dialog = page.getByRole("dialog"); const accept = dialog.getByRole("button", { name: ui(locale, "اعتماد وتنفيذ") });
    await expect(accept).toBeDisabled(); await expect(dialog).toContainText("Improve the winter copy");
    await dialog.getByRole("checkbox").check(); await accept.click(); await expect(dialog).toHaveCount(0);
    assert.equal(writes.at(-1).action, "revise"); assert.equal(writes.at(-1).refinement, "Improve the winter copy"); assert.equal(writes.at(-1).version, 2); assert.deepEqual(plan.request.projectIds, originalRequest.projectIds); checks++;
    await open("active");
    await page.getByRole("textbox", { name: ui(locale, "رسالتك للمساعد") }).fill("Review expansion budget");
    await page.getByRole("button", { name: ui(locale, "إرسال للمساعد") }).click();
    await page.getByRole("region", { name: ui(locale, "محادثة خطة Google Search") }).getByRole("button", { name: ui(locale, "مراجعة تعديل الميزانية") }).click();
    dialog = page.getByRole("dialog"); await expect(dialog.getByRole("spinbutton")).toHaveValue("24"); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: ui(locale, "اعتماد وتنفيذ") }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("spinbutton").first()).toHaveValue("24");
    assert.deepEqual({ action: writes.at(-1).action, dailyBudget: writes.at(-1).dailyBudget, newDailyBudget: writes.at(-1).newDailyBudget, currency: writes.at(-1).currency }, { action: "budget", dailyBudget: 10, newDailyBudget: 24, currency: "USD" }); checks++;
    await page.getByRole("button", { name: ui(locale, "تفعيل التطوير والمتابعة") }).click(); dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton").nth(0).fill("5"); await dialog.getByRole("spinbutton").nth(1).fill("20");
    const boxes = dialog.getByRole("checkbox"); await boxes.nth(0).check(); await boxes.nth(1).check(); await boxes.nth(2).check();
    await dialog.getByRole("button", { name: ui(locale, "اعتماد وتنفيذ") }).click(); await expect(dialog).toHaveCount(0);
    assert.deepEqual(writes.at(-1).policy, { enabled: true, maxKeywordCost: 5, minClicks: 20, expandKeywords: true, refreshAds: true }); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); checks++;
    await page.screenshot({ path: path.join(artifacts, `${locale}-${width}.png`), fullPage: true }); await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "summary.json"), JSON.stringify({ fixtureOnly: true, providerCalls: 0, checks, languages: ["ar", "en", "tr"], widths: [390, 1440], errors }, null, 2));
  console.log(JSON.stringify({ fixtureOnly: true, checks, providerCalls: 0, errors }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
