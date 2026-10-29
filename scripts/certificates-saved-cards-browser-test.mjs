import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

// Actual components and document renderers, with local provider/DB boundaries.
// The browser cannot contact a bank, Meta, email provider or production API.
const require = createRequire(import.meta.url);
const output = ".artifacts/certificates-saved-cards";
await mkdir(output, { recursive: true });
const messages = Object.fromEntries(await Promise.all(["ar", "en", "tr"].map(async locale => [locale, JSON.parse(await readFile(`i18n/messages/${locale}.json`, "utf8"))])));
const nodeBundle = await build({ stdin: { contents: 'export{buildManualDocument,manualDocumentHtml}from"./lib/certificates/manual-render";', resolveDir: process.cwd() }, bundle: true, packages: "external", platform: "node", format: "cjs", write: false, jsx: "automatic", tsconfig: "tsconfig.json", plugins: [{ name: "local-data", setup(builder) {
  builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "local" }));
  builder.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "prisma", namespace: "local" }));
  builder.onLoad({ filter: /.*/, namespace: "local" }, ({ path }) => ({ contents: path === "prisma" ? "export const prisma={globalSettings:{findFirst:async()=>null}}" : "export{}" }));
} }] });
const rendererPath = `${process.cwd()}/${output}/renderer.cjs`;
await writeFile(rendererPath, nodeBundle.outputFiles[0].contents);
const renderer = require(rendererPath);

const replacements = {
  "next/link": 'import React from"react";export default function Link({children,...props}){return <a {...props}>{children}</a>}',
  "next/navigation": 'export function useRouter(){return{push:p=>window.fixtureNavigation=p}}',
  "next-auth/react": 'export function useSession(){return{data:{user:{id:"fixture-user",role:"ADMIN",name:"Donor",email:"donor@example.test"}}}}export function signIn(){}',
  "next-intl": 'export function useLocale(){return window.fixtureLocale}export function useMessages(){return window.fixtureMessages}export function useTranslations(ns){const t=(key,vars={})=>String(window.fixtureMessages[ns]?.[key]||key).replace(/\\{(\\w+)\\}/g,(_,k)=>vars[k]??"");t.has=key=>key in(window.fixtureMessages[ns]||{});return t}',
  "@/hooks/use-toast": 'export function useToast(){return{toast:value=>window.fixtureToasts.push(value)}}',
  "@/hooks/useMinbarCart": 'const items=[{id:"fixture",projectId:"fixture",title:"Fixture Project",typeKey:"project",freqKey:"once",amount:25,currency:"USD",amountUSD:25}];export function useMinbarCart(){return{items,hydrated:true,replace(){}}}',
  "@/hooks/useMinbarMoney": 'export function useMinbarMoney(){return{currency:"USD",format:String,formatNumber:String}}',
  "@/hooks/useDonationAmount": 'export function useDonationAmount(){return{lineTooSmall:()=>false,minLabel:"1"}}export function useHealLegacyRows(){}',
  "@/hooks/useReferralCode": 'export function useReferralCode(){return()=>null}',
  "@/lib/minbar/cart": 'export function readTeamSupport(){return 0}export function readTeamSupportRecurring(){return false}export function teamSupportIsRecurring(){return false}export function clearCart(){}export function rememberCheckoutAttempt(){}',
  "@/lib/global-settings-client": 'export async function fetchGlobalSettings(){return{teamSupportEnabled:false,mainGateway:"ALBARAKA",payforEnabled:false,albarakaUseOOS:false,albarakaConfigured:true,albarakaRecurringReady:true}}',
  "@/lib/minbar/checkout": 'export class OrderRejectedError extends Error{}export class UnpayableItemsError extends Error{}export function browserTimezone(){return"Europe/Istanbul"}export function orderSchedule(){return null}export function orderType(){return"ONE_TIME"}export async function createDonation(input){window.fixtureOrders.push(input);return{id:"fixture-donation",accessToken:"fixture-token"}}export async function initiateBankPayment(...args){window.fixtureBankCalls.push(args);return{action:"/local-bank",fields:{}}}export function submitGatewayForm(){window.fixtureSubmitted=true}export function chargeWithStripe(){}export function markDonationFailed(){}export function startPayPalPayment(){}',
  "@/lib/stripe-client": 'export function getStripePromise(){return null}',
  "@stripe/react-stripe-js": 'export function Elements({children}){return children}',
  "@/components/StripePaymentStep": 'export function StripePaymentStep(){return null}',
  "react-credit-cards-2": 'export default function Cards(){return null}',
  "react-international-phone": 'import React from"react";export function PhoneInput({value,onChange}){return <input type="tel" value={value} onChange={e=>onChange(e.target.value)}/>}',
  "./StoryViewer": 'export default function StoryViewer(){return null}',
};
const bundle = await build({ stdin: { contents: 'import React from"react";import{createRoot}from"react-dom/client";import Certificates from"./app/(dashboard)/dashboard/certificates/page";import Checkout from"./components/minbar/checkout/CheckoutPage";import{Hero}from"./components/minbar/home/TopSections";window.fixtureToasts=[];window.fixtureOrders=[];window.fixtureBankCalls=[];createRoot(document.getElementById("root")).render(location.pathname==="/certificates"?<Certificates/>:location.pathname==="/hero"?<Hero onPlayIntro={()=>{}}/>:<Checkout projects={[{slug:"fixture",id:"fixture-id",title:"Fixture Project",raised:0}]} categories={[]} banks={[]} defaultCountry="tr" donor={{firstName:"Sample",lastName:"Donor",email:"donor@example.test",phone:"+905551112233"}}/>);', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fixture", setup(builder) {
  builder.onResolve({ filter: /.*/ }, ({ path }) => path in replacements ? { path, namespace: "fixture" } : undefined);
  builder.onResolve({ filter: /\.css$/ }, ({ path }) => ({ path, namespace: "fixture-css" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture-css" }, () => ({ contents: "export{}", loader: "js" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: replacements[path], loader: "tsx", resolveDir: process.cwd() }));
} }] });
const minbarCss = await readFile("styles/minbar/minbar.css", "utf8");
const uiCss = await readFile(`${output}/ui.css`, "utf8").catch(() => "");
const calls = []; let created = 0; const issued = new Map();
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture");
    if (url.pathname === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))?.contents || bundle.outputFiles[0].contents); return; }
    if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(uiCss + minbarCss); return; }
    if (url.pathname.startsWith("/minbar/") || url.pathname.startsWith("/fonts/")) { const file = await readFile(`public${url.pathname}`); response.setHeader("Access-Control-Allow-Origin", "*"); if (url.pathname.endsWith(".css")) response.setHeader("Content-Type", "text/css"); response.end(file); return; }
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      calls.push({ path: url.pathname, method: request.method, body });
      response.setHeader("Content-Type", "application/json");
      if (url.pathname === "/api/credit-cards") { response.end(JSON.stringify({ cards: [{ id: "saved-card", last4: "4242", cardType: "VISA", expiryDate: "12/30", isDefault: true }] })); return; }
      if (url.pathname === "/api/certificates/copy") { response.end(JSON.stringify({ overrides: {}, defaults: {} })); return; }
      if (url.pathname.endsWith("/preview")) {
        const document = await renderer.buildManualDocument(body, "PREVIEW", "PREVIEW");
        response.end(JSON.stringify({ html: await renderer.manualDocumentHtml(document, `http://127.0.0.1:${server.address().port}`), preview: { document, signature: "fixture", expiresAt: Date.now() + 1_800_000 } })); return;
      }
      if (url.pathname === "/api/certificates/issued" && request.method === "POST") { created++; const row = { id: `issued-${created}`, serial: `MIA-MAN-${created}`, url: `/issued-${created}.pdf` }; issued.set(row.id, row); response.end(JSON.stringify(row)); return; }
      if (url.pathname === "/api/certificates/issued") { response.end(JSON.stringify({ rows: [] })); return; }
      if (url.pathname.endsWith("/send")) { response.end(JSON.stringify({ ok: true })); return; }
      if (url.pathname === "/api/stories") { response.end(JSON.stringify({ stories: [] })); return; }
      response.end("{}"); return;
    }
    const locale = url.searchParams.get("locale") || "ar";
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>@font-face{font-family:Cairo;src:url('/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2')}body{margin:0;background:#f7f8fa;font-family:Cairo,Arial,sans-serif;--font-cairo:Cairo;--deep:#10212b;--muted:#64748b;--red:#a93428;--gold:#d39a27;--border:#dce3e8;--sand:#f7f2ea}#root{padding:${url.pathname === "/hero" ? "0" : "16px"};max-width:1440px;margin:auto}input,select,textarea{max-width:100%}*{box-sizing:border-box}</style><div id="root" class="${url.pathname === "/certificates" ? "dash-vivid" : "mia-scope"}"></div><script>window.fixtureLocale=${JSON.stringify(locale)};window.fixtureMessages=${JSON.stringify(messages[locale]).replace(/</g, "\\u003c")}</script><script src="/bundle.js"></script></html>`);
  } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = []; let cases = 0;
async function pageAt(path, width) { const page = await browser.newPage({ viewport: { width, height: 1100 } }); page.on("pageerror", error => errors.push(error.message)); await page.route("https://**/*", route => route.abort()); await page.goto(base + path); return page; }
try {
  for (const width of [390, 1440]) {
    const page = await pageAt("/certificates", width);
    await page.getByRole("heading", { name: "الشهادات", exact: true }).waitFor();
    await page.locator("#certificate-donorName").fill("Sample Donor");
    await page.locator("#certificate-email").fill("recipient@example.test");
    await page.locator("#certificate-phone").fill("+905551112233");
    await page.getByRole("tab", { name: "نصوص الشهادات", exact: true }).click();
    await page.getByRole("tab", { name: "إرسال الشهادات والإهداءات", exact: true }).click();
    assert.equal(await page.locator("#certificate-donorName").inputValue(), "Sample Donor");
    await page.locator("#certificate-locale").selectOption("tr");
    await page.getByRole("button", { name: "معاينة المستند", exact: true }).click();
    const frame = page.frameLocator('iframe[title="معاينة الشهادة"]');
    await frame.getByText("Sample Donor", { exact: true }).waitFor();
    assert.equal(await frame.locator("html").getAttribute("lang"), "tr");
    const before = created;
    await page.getByRole("button", { name: "إرسال بريد", exact: true }).click();
    await page.getByRole("link", { name: "تحميل النسخة الصادرة", exact: true }).waitFor();
    await page.getByRole("button", { name: "إرسال واتساب", exact: true }).click();
    await page.waitForFunction(() => window.fixtureToasts.length === 2);
    assert.equal(created, before + 1, "email and WhatsApp reuse the same issued document");
    assert.ok(calls.filter(call => call.path === "/api/certificates/issued" && call.method === "POST").at(-1).body.preview.document.copy.body);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: `${output}/certificates-${width}.png`, fullPage: true });
    await page.close(); cases++;
  }
  for (const locale of ["ar", "en", "tr"]) for (const width of [390, 1440]) {
    const page = await pageAt(`/checkout?locale=${locale}`, width);
    await page.locator('input[value="saved-card"]').waitFor();
    assert.equal(await page.locator('input[autocomplete="cc-number"]').count(), 0);
    const code = page.locator('input[autocomplete="cc-csc"]'); await code.fill("123");
    await page.locator("#albaraka-2d").check();
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => window.fixtureSubmitted === true);
    const bank = await page.evaluate(() => window.fixtureBankCalls[0]);
    assert.equal(bank[5], "saved-card"); assert.equal(bank[3].number, ""); assert.equal(bank[3].cvv, "123");
    await page.getByLabel(messages[locale].DonationDialog.useNewCard, { exact: true }).check();
    await page.locator('input[autocomplete="cc-number"]').waitFor();
    assert.equal(await code.inputValue(), "", "switching cards clears the security code");
    assert.equal(await page.getByLabel(messages[locale].DonationDialog.rememberCard, { exact: true }).isChecked(), false);
    await page.screenshot({ path: `${output}/checkout-${locale}-${width}.png`, fullPage: true });
    await page.close(); cases++;
  }
  for (const width of [320, 360, 390, 430, 560]) {
    const page = await pageAt("/hero?locale=ar", width);
    await page.locator(".mia-hero-title").waitFor(); await page.evaluate(() => document.fonts.ready);
    const heading = await page.locator(".mia-hero-title").evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const box = element.getBoundingClientRect(); return { height: box.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight), rects: [...range.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })), width: element.scrollWidth, available: box.width, text: element.textContent }; });
    await page.screenshot({ path: `${output}/hero-${width}.png` });
    assert.ok(heading.height <= heading.lineHeight * 1.1, `${width}px: ${JSON.stringify(heading)}`); assert.ok(heading.width <= heading.available + 2, `${width}px heading overflows`);
    await page.close(); cases++;
  }
  const { PDFDocument } = require("pdf-lib");
  const documentCases = ["ar", "en", "tr"].flatMap(locale => ["THANKS", "SHARE", "METER", "RECEIPT"].map(kind => ({ locale, kind, long: false })));
  documentCases.push(...["ar", "tr"].flatMap(locale => ["THANKS", "METER"].map(kind => ({ locale, kind, long: true }))));
  for (const { locale, kind, long } of documentCases) {
    const input = { kind, locale, donorName: "Sample Donor", recipientName: "Recipient", email: "recipient@example.test", phone: "+905551112233", projectTitle: long ? "Project details ".repeat(14).slice(0, 200) : locale === "ar" ? "ترميم منازل القدس" : "Jerusalem homes restoration", amount: 50, currency: "TRY", count: 2, dedicatedTo: "Family", note: long ? (locale === "ar" ? "تفاصيل إضافية للمشروع ".repeat(25) : "Proje için ek açıklamalar ".repeat(25)).slice(0, 400) : "", issueDate: "2026-10-29", paymentMethod: "CASH", received: true };
    const document = await renderer.buildManualDocument(input, "fixture", "MIA-MAN-2026-000001");
    const page = await browser.newPage({ viewport: { width: kind === "RECEIPT" ? 794 : 1125, height: kind === "RECEIPT" ? 1123 : 800 } });
    await page.route("https://**/*", route => route.abort());
    await page.setContent(await renderer.manualDocumentHtml(document, base)); await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => { const sheet = document.querySelector(".cert-sheet,.waqf-pair,.rcp-sheet"), box = sheet.getBoundingClientRect(), walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT), clipped = []; let node; while (node = walker.nextNode()) { if (!node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); const rect = range.getBoundingClientRect(); if (rect.bottom > box.bottom + 4 || rect.right > box.right + 4 || rect.left < box.left - 4) clipped.push(node.textContent.slice(0, 70)); } return clipped; });
    await page.screenshot({ path: `${output}/document-${kind}-${locale}${long ? "-long" : ""}.png` });
    assert.deepEqual(overflow, [], `${kind}/${locale}${long ? "-long" : ""}: clipped text`);
    const bytes = await page.pdf({ format: "A4", landscape: kind !== "RECEIPT", printBackground: true, preferCSSPageSize: true });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1, `${kind}/${locale}: a document must fit one page`);
    await writeFile(`${output}/document-${kind}-${locale}${long ? "-long" : ""}.pdf`, bytes);
    await page.close(); cases++;
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cases, errors, productionRequests: 0, payments: 0, recipientMessagesSent: 0 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
