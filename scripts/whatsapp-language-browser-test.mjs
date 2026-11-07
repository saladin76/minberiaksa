import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const require = createRequire(import.meta.url);
const translations = { en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json") };
const text = (locale, value) => locale === "ar" ? value : translations[locale][value];
const artifacts = path.resolve(".artifacts/whatsapp-language");
await mkdir(artifacts, { recursive: true });
const bundle = await build({ stdin: { contents: `
  import React from "react";import {createRoot} from "react-dom/client";
  import {SmartWhatsappDialog} from "./components/dashboard/SmartWhatsappDialog";
  import {setDashLocale} from "./lib/dashboard/i18n";
  const params=new URLSearchParams(location.search),locale=params.get("locale")||"ar";
  setDashLocale(locale);document.documentElement.dir=locale==="ar"?"rtl":"ltr";
  createRoot(document.getElementById("root")).render(<SmartWhatsappDialog open onOpenChange={()=>{}} userId="fixture" initialMode={params.get("mode")||"MARKETING"}/>);
`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"test"' } });
const css = (await postcss([tailwindcss({ ...require("../tailwind.config.ts").default, content: ["components/dashboard/SmartWhatsappDialog.tsx", "components/ui/{button,dialog}.tsx"] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;
let fixture;
let sends = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://fixture");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { sends++; response.writeHead(405); response.end(); return; }
  if (url.pathname === "/api/dashboard/communication/whatsapp/smart-send") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ ok: true, context: fixture })); return; }
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].contents); return; }
  if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) for (const mode of ["MARKETING", "UTILITY"]) for (const available of [false, true]) {
    const templates = available ? [{ id: "template", name: "Fixture approved template", category: mode }] : [];
    fixture = { userId: "fixture", name: "Fixture donor", phone: "+905550000000", locale: "tr", country: "TR", doNotContact: false, whatsappUnsubscribed: false, consentCheckUnavailable: false, directSendEnabled: false, conversationId: null, replyWindow: { open: false, lastInboundAt: null, remainingMs: 0, lastInboundMessageId: null }, sender: null, marketingTemplates: mode === "MARKETING" ? templates : [], utilityTemplates: mode === "UTILITY" ? templates : [] };
    const page = await browser.newPage({ viewport: { width, height: 920 } });
    await page.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(`${base}/?locale=${locale}&mode=${mode}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Türkçe", { exact: true })).toBeVisible();
    const send = dialog.getByRole("button", { name: text(locale, "إرسال"), exact: true });
    await expect(send).toBeDisabled();
    if (available) {
      await dialog.locator("select").selectOption("template");
      await expect(send).toBeEnabled();
      await expect(dialog.getByRole("status")).toHaveCount(0);
    } else {
      await expect(dialog.getByRole("status")).toHaveText(text(locale, "لا توجد نسخة معتمدة من القالب لهذا الرقم/اللغة."));
      await expect(dialog.locator("select option")).toHaveCount(1);
    }
    const box = await dialog.evaluate((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }));
    if (box.left < -1 || box.right > width + 1) throw new Error("Dialog overflows viewport");
    if (mode === "MARKETING" && !available) await page.screenshot({ path: path.join(artifacts, `${locale}-${width}-missing.png`) });
    results.push({ locale, width, mode, available, passed: true });
    await page.close();
  }
  if (sends !== 0) throw new Error("Browser language checks attempted a message send");
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ cases: results.length, sends, results }, null, 2));
  console.log(`WhatsApp language dialog: ${results.length} cases passed; no message sent.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
