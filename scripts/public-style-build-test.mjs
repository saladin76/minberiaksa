import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { SUPPORTED_LOCALES } = require("../lib/locales.ts");
const { MINBAR_LOCALE_SEO } = require("../lib/seo-minbar.generated.ts");
// Run after `next build`. Uses read-only in-memory Prisma fixtures; no live data/providers.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts", "public-style-build");
await mkdir(artifacts, { recursive: true });
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const preload = path.join(artifacts, "fixture-prisma.mjs");
await writeFile(preload, `const read = new Set(['find','aggregate','distinct','getMore','count']);const model = {findMany:async()=>[],findFirst:async()=>null,findUnique:async()=>null,count:async()=>0,aggregate:async()=>({_sum:{}})};globalThis.prisma = new Proxy({$runCommandRaw:async command=>{if(!Object.keys(command).some(key=>read.has(key)))throw new Error('Fixture forbids database writes');return {cursor:{firstBatch:[],nextBatch:[]},values:[],n:0}},$disconnect:async()=>{}},{get:(target,key)=>key in target?target[key]:model});globalThis.prismaBankLedgerPrivate=globalThis.prisma;`);
const server = spawn(process.execPath, ["--import", preload, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, DATABASE_URL: "mongodb://127.0.0.1:27018/minberi_fixture?serverSelectionTimeoutMS=500&connectTimeoutMS=500", NEXTAUTH_URL: base, NEXTAUTH_SECRET: "fixture-auth-build-secret", GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-secret", STRIPE_SECRET_KEY: "sk_test_fixture_no_network" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser; const errors = [];
server.stdout.on("data", data => { output += data; }); server.stderr.on("data", data => { output += data; });
try {
  for (let attempt = 0; !output.includes("Ready in"); attempt++) {
    if (attempt > 100 || server.exitCode !== null) throw new Error(`Fixture server did not start: ${output.slice(-1000)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const response = await fetch(`${base}/ar`); assert.equal(response.status, 200);
  const html = await response.text(); await writeFile(path.join(artifacts, "ar.html"), html);
  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce((size, match) => size + match[1].length, 0);
  assert.ok(inlineCss < 50_000, `shared styles should be external, got ${inlineCss} inline characters`);
  const sheets = [...html.matchAll(/<link\b(?=[^>]*rel="stylesheet")[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.ok(sheets.length > 0, "external CSS must be discoverable in the initial document");
  let cssBytes = 0;
  for (const href of new Set(sheets)) {
    const sheet = await fetch(new URL(href.replace(/&amp;/g, "&"), base)); assert.equal(sheet.status, 200);
    assert.ok(sheet.headers.get("cache-control")?.includes("immutable"), "versioned CSS must be cacheable");
    cssBytes += (await sheet.text()).length;
  }
  assert.ok(!html.includes("GTM-MMNBQQWB") && !html.includes("contentsquare.net"));
  assert.match(html, /rel="preload"[^>]*as="image"[^>]*imageSrcSet=/i);
  for (const locale of SUPPORTED_LOCALES) {
    const about = await fetch(`${base}/${locale}/about-us`); assert.equal(about.status, 200);
    const markup = await about.text(); const name = MINBAR_LOCALE_SEO[locale].siteName;
    assert.ok(/<title>([^<]+)<\/title>/.exec(markup)?.[1].includes(name), `${locale} internal title must identify the institution`);
    assert.ok(markup.includes(`https://minberiaksa.org/${locale}/about-us`));
  }
  const oldContact = await fetch(`${base}/iletisim`, {redirect:"manual"});
  assert.equal(oldContact.status,308);assert.equal(oldContact.headers.get("location"),"/tr/contact-us");
  const localizedContact = await fetch(`${base}/en/iletisim`, {redirect:"manual"});assert.equal(localizedContact.status,301);assert.equal(new URL(localizedContact.headers.get("location"),base).pathname,"/en/contact-us");
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const locale of ["ar", "tr", "en", "ja", "zh", "hi"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/_next/image" && /^https?:/.test(url.searchParams.get("url") || "")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"/>' });
      return url.origin === base ? route.continue() : route.fulfill({ contentType: "text/javascript", body: "/* fixture: external requests disabled */" });
    });
    await page.goto(`${base}/${locale}`, { waitUntil: "domcontentloaded" });
    const poster = page.locator("img.mia-hero-poster");
    await expect(poster).toBeVisible(); await expect(poster).toHaveAttribute("fetchpriority", "high"); await expect.poll(() => poster.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    assert.ok((await poster.boundingBox()).width <= width);
    const waqfCta = page.locator("#waqf-grid > div:first-child > a").filter({visible:true});
    await expect(waqfCta).toHaveCount(1); await expect(waqfCta).toBeVisible();
    const colours = await waqfCta.evaluate(node=>{const s=getComputedStyle(node);return {fg:s.color,bg:s.backgroundColor};});
    const luminance = rgb=>{const channels=rgb.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
    const a=luminance(colours.fg),b=luminance(colours.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,`${locale} waqf CTA contrast ${ratio}`);
    await page.screenshot({ path: path.join(artifacts, `home-${locale}-${width}.png`), animations: "disabled" });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ fixture: true, htmlBytes: Buffer.byteLength(html), inlineCssCharacters: inlineCss, stylesheetCount: new Set(sheets).size, externalCssCharacters: cssBytes, widths: [390, 1440], locales: [...SUPPORTED_LOCALES], browserLocales: ["ar", "tr", "en", "ja", "zh", "hi"], providerCalls: 0, databaseWrites: 0, artifacts }));
} finally { await browser?.close(); server.kill("SIGTERM"); await writeFile(path.join(artifacts, "server.log"), output); }
