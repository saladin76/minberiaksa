import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const messages = Object.fromEntries(await Promise.all(["ar", "en", "tr"].map(async locale => [locale, JSON.parse(await readFile(`i18n/messages/${locale}.json`, "utf8"))])));
const hooks = `export function useMinbarMoney(){return{format:n=>String(n),formatNumber:n=>String(n)}}
export function useDonationAmount(){return{fromLocal:n=>({usd:n}),fromChip:c=>({usd:c?.usd||25}),labelOf:g=>String(g.usd),tooSmall:()=>false,minLabel:"1"}}
export function useProjectPricing(){return{chips:[25,50,100].map(usd=>({usd,label:String(usd)})),sharePrice:null}}
export function useShareWording(){return{t:k=>k,unitWord:()=>"share",countLabel:n=>String(n)}}export function shareProgress(){return null}`;
const bundle = await build({ stdin: { contents: `import React from "react";import{createRoot}from"react-dom/client";
import DonationPanel from "./components/minbar/projects/DonationPanel";import DocumentsPanel from "./components/minbar/success/DocumentsPanel";
window.fixtureCart=[];const docs={issued:true,receiptNo:"fixture",thanks:{donorName:"Donor"},waqf:[],receipt:null,gifts:[{id:"111111111111111111111111",recipientName:"Recipient"}]};
createRoot(document.getElementById("root")).render(location.pathname==="/docs"?<DocumentsPanel documents={docs} donationId="222222222222222222222222" accessToken="owner-fixture" donorName="Donor"/>:<DonationPanel project={{slug:"fixture",title:"Fixture Project",raised:0,goal:null}}/>);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fixture", setup(builder) {
  builder.onResolve({ filter: /^next-intl$/ }, () => ({ path: "intl", namespace: "fixture" }));
  builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/hooks\/(useMinbarMoney|useDonationAmount|useProjectPricing|useShareWording)$/ }, () => ({ path: "hooks", namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/lib\/minbar\/cart$/ }, () => ({ path: "cart", namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/lib\/minbar\/routes$/ }, () => ({ path: "routes", namespace: "fixture" }));
  builder.onResolve({ filter: /^@\/components\/minbar\/certificates\// }, () => ({ path: "certificate", namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "intl" ? `export function useLocale(){return window.fixtureLocale}export function useTranslations(ns){return(key,vars={})=>String(window.fixtureMessages[ns]?.[key]||key).replace(/\\{(\\w+)\\}/g,(_,k)=>vars[k]??"")}`
    : args.path === "navigation" ? `export function useRouter(){return{push:p=>{window.fixturePath=p}}}`
    : args.path === "hooks" ? hooks : args.path === "cart" ? `export function addToCart(item){window.fixtureCart.push(item)}`
    : args.path === "routes" ? `export function miaPath(_kind,locale){return"/"+locale+"/cart"}`
    : `export default function Certificate(){return null}` }));
} }] });
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://fixture");
  if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].contents); return; }
  const locale = url.searchParams.get("locale") || "ar";
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html dir="${locale === "ar" ? "rtl" : "ltr"}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:18px;font-family:Arial;--deep:#10212b;--muted:#64748b;--red:#a93428;--border:#dce3e8;--sand:#f7f2ea}#root{max-width:500px;margin:auto}*{box-sizing:border-box}</style><div id="root"></div><script>window.fixtureLocale=${JSON.stringify(locale)};window.fixtureMessages=${JSON.stringify(messages[locale]).replace(/</g, "\\u003c")}</script><script src="/bundle.js"></script></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];
let cases = 0;
try {
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }); page.on("pageerror", e => errors.push(e.message));
    await page.route("https://**/*", route => route.abort());
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/panel?locale=${locale}`);
    const t = messages[locale];
    await page.getByRole("button").filter({ hasText: t.cart.giftThisDonation }).click();
    await page.getByRole("button", { name: t.common.donateNow, exact: true }).click();
    await page.getByRole("alert").waitFor(); assert.equal(await page.evaluate(() => window.fixtureCart.length), 0);
    await page.getByPlaceholder(t.cart.certNamePh).fill("Recipient");
    await page.getByRole("button", { name: t.cart.giftChannelEmail, exact: true }).click();
    await page.locator('input[type="email"]').fill("invalid");
    await page.getByRole("button", { name: t.common.donateNow, exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureCart.length), 0);
    await page.locator('input[type="email"]').fill("recipient@example.test");
    await page.getByRole("button", { name: t.cart.sendViaWhatsapp, exact: true }).click();
    await page.locator('input[type="tel"]').fill("05321234567");
    await page.getByRole("button", { name: t.common.donateNow, exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureCart.length), 0);
    await page.locator('input[type="tel"]').fill("00905321234567");
    await page.getByRole("button", { name: t.common.donateNow, exact: true }).click();
    const cart = await page.evaluate(() => window.fixtureCart);
    assert.equal(cart.length, 1); assert.equal(cart[0].gift.recipientName, "Recipient");
    assert.equal(cart[0].currency, "USD"); assert.equal(cart[0].amount, 25);
    assert.deepEqual(cart[0].gift.channels, ["whatsapp", "email"]);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.goto(`${base}/docs?locale=${locale}`);
    const giftLink = page.getByRole("link").filter({ hasText: "Recipient" }); await giftLink.waitFor();
    assert.equal(await giftLink.getAttribute("href"), "/api/gifts/111111111111111111111111/certificate?t=owner-fixture");
    await mkdir(".artifacts/gifts", { recursive: true }); await page.screenshot({ path: `.artifacts/gifts/${locale}-${width}.png` });
    await page.close(); cases++;
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ cases, errors, recipientMessagesSent: 0 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
