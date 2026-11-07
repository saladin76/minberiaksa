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
const catalog={en:require("../lib/dashboard/i18n/catalog/en.json"),tr:require("../lib/dashboard/i18n/catalog/tr.json")};
const ui=(lang,text)=>lang==="ar"?text:catalog[lang][text]||text;
const entry = `import React from "react";import {createRoot} from "react-dom/client";import {NextIntlClientProvider} from "next-intl";
import CurrencySelector from "./components/CurrencySelector";import useCurrencyConverter from "./hooks/useCurrencyConverter";
import {DashboardFilterPanel} from "./components/dashboard/DashboardFilterPanel";
import {CampaignScheduleDialog} from "./app/(dashboard)/dashboard/communication/campaigns/_components/CampaignScheduleDialog";
import AuthError from "./app/[locale]/auth/error/page";import {PaymentCurrencyNotice} from "./components/PaymentCurrencyNotice";
import {setDashLocale} from "./lib/dashboard/i18n";import ar from "./i18n/messages/ar.json";import en from "./i18n/messages/en.json";import tr from "./i18n/messages/tr.json";
const params=new URLSearchParams(location.search),lang=params.get("lang")||"en",mode=params.get("mode")||"currency";setDashLocale(lang);document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";
function Currency(){const c=useCurrencyConverter();return <><CurrencySelector showDefaultCurrencyOption onDark={false}/><output id="selection">{c.getSelectedCurrency()}</output><output id="value">{c.convertToCurrency(10).convertedValue}</output></>}
const campaign={id:"fixture",name:"Fixture campaign",channel:"EMAIL",status:params.has("scheduled")?"SCHEDULED":"DRAFT",scheduledAt:params.has("scheduled")?"2027-01-02T06:00:00Z":null};
createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale={lang} timeZone="UTC" messages={{ar,en,tr}[lang]}>{mode==="currency"?<Currency/>:mode==="filter"?<DashboardFilterPanel><input aria-label="Fixture filter" defaultValue=""/></DashboardFilterPanel>:mode==="schedule"?<CampaignScheduleDialog campaign={campaign} onChanged={()=>{window.changed=true}} onClose={()=>{window.closed=true}}/>:mode==="notice"?<PaymentCurrencyNotice gateway="PAYFOR" currency="USD" amount={10} phone="+966501234567"/>:<AuthError/>}</NextIntlClientProvider>);`;
const mocks = {
 "next/navigation": 'const search=new URLSearchParams(location.search);export function useSearchParams(){return search} export function useParams(){return {locale:search.get("lang")||"en"}}',
 "next/link": 'import React from "react";export default function Link({children,...p}){return <a {...p}>{children}</a>}',
 "@/components/CurrencyFromUrlSync": 'export const CURRENCY_COOKIE_UPDATED_EVENT="mia:currency-cookie-updated";',
 "@/components/GoogleSignInButton": 'import React from "react";export default function Google({callbackUrl,fallbackLabel}){return <button data-callback={callbackUrl}>{fallbackLabel}</button>}',
};
const bundle = await build({ stdin:{contents:entry,resolveDir:process.cwd(),loader:"tsx"}, bundle:true,write:false,outfile:"fixture.js",platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"',"process.env":"{}"},plugins:[{name:"boundaries",setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:"fixture"}:null);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:process.cwd()}));}}] });
const compiled = await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:["components/CurrencySelector.tsx","components/dashboard/DashboardFilterPanel.tsx","app/(dashboard)/dashboard/communication/campaigns/_components/CampaignScheduleDialog.tsx","components/ui/dialog.tsx"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined});
const js=bundle.outputFiles.find(f=>f.path.endsWith(".js")).contents;
const server=createServer((req,res)=>{if(req.url?.startsWith("/fixture.js")){res.setHeader("content-type","text/javascript");res.end(js)}else{res.setHeader("content-type","text/html");res.end(`<html><head><style>${compiled.css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`)}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${server.address().port}`;
const out=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/content-editor","saudi-mobile");await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:["--no-sandbox","--disable-dev-shm-usage"]});
let checks=0;const errors=[];
try {
 for(const lang of ["ar","en","tr"]) for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:"America/Los_Angeles"});const page=await context.newPage();page.on("pageerror",e=>{errors.push(e.message);console.error("UI error:",e.message)});
  const calls=[];let fail=false;
  await page.route("**/api/**",route=>{const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,body:req.method()==="POST"?req.postDataJSON():null});
   if(url.pathname==="/api/exchange/rates")return route.fulfill({json:{result:"success",rates:{USD:1,EUR:0.9,TRY:50}}});
   if(url.pathname==="/api/payments/route")return route.fulfill({json:{gateway:"PAYFOR",quote:{amountTRY:500}}});
   if(url.pathname.endsWith("/transition"))return route.fulfill(fail?{status:503,json:{ok:false,error:"Fixture unavailable"}}:{json:{ok:true}});
   throw new Error("Unexpected fixture API "+url.pathname);
  });
  await context.addCookies([{name:"currency",value:"TRY",url:origin}]);
  await page.goto(origin+`/dashboard?mode=currency&lang=${lang}`);await expect(page.locator("#selection")).toHaveText("DEFAULT");await expect(page.locator("#value")).toHaveText("10");checks++;
  await page.getByRole("button",{name:/Default/}).click();await page.getByRole("button",{name:"Euro €",exact:true}).click();await expect(page.locator("#selection")).toHaveText("EUR");
  assert.equal((await context.cookies()).find(c=>c.name==="currency").value,"TRY");assert.equal((await context.cookies()).find(c=>c.name==="dashboard_currency").value,"EUR");checks++;
  await page.goto(origin+`/dashboard?mode=filter&lang=${lang}`);const field=page.getByLabel("Fixture filter"),toggle=page.getByRole("button");
  if(width===390){await expect(field).toBeHidden();await toggle.click();await field.fill("preserved");await toggle.click();await expect(field).toBeHidden();await toggle.click();await expect(field).toHaveValue("preserved");}else{await expect(field).toBeVisible();await expect(toggle).toBeHidden();}checks++;
  await page.goto(origin+`/dashboard?mode=schedule&lang=${lang}`);const time=page.locator('input[type="datetime-local"]');await time.fill("2027-01-02T09:00");await page.getByRole("button",{name:ui(lang,"حفظ الجدولة"),exact:true}).click();await expect.poll(()=>calls.filter(c=>c.path.endsWith("/transition")).length).toBe(1);assert.equal(calls.at(-1).body.scheduledAt,"2027-01-02T06:00:00.000Z");assert.equal(calls.at(-1).body.action,"SCHEDULE");checks++;
  await page.goto(origin+`/dashboard?mode=schedule&scheduled=1&lang=${lang}`);await expect(time).toHaveValue("2027-01-02T09:00");await page.getByRole("button",{name:ui(lang,"إلغاء الجدولة"),exact:true}).click();await expect.poll(()=>calls.filter(c=>c.body?.action==="UNSCHEDULE").length).toBe(1);checks++;
  fail=true;await page.goto(origin+`/dashboard?mode=schedule&lang=${lang}`);await time.fill("2027-01-03T09:00");await page.getByRole("button",{name:ui(lang,"حفظ الجدولة"),exact:true}).click();await expect(page.getByRole("alert")).toHaveText("Fixture unavailable");await expect(time).toHaveValue("2027-01-03T09:00");checks++;
  await page.goto(origin+`/dashboard?mode=auth&lang=${lang}&error=undefined&callbackUrl=https%3A%2F%2Fevil.invalid`);const messages=JSON.parse(await readFile(`i18n/messages/${lang}.json`,"utf8"));await expect(page.getByRole("heading")).toHaveText(messages.SignInDialog.authErrorTitle);assert.equal(await page.locator("[data-callback]").getAttribute("data-callback"),`/${lang}/checkout`);assert.equal(await page.getByRole("link").getAttribute("href"),`/${lang}/checkout`);checks++;
  await page.screenshot({path:path.join(out,`${lang}-${width}-auth.png`),fullPage:true});
  if(width===390){await page.goto(origin+`/dashboard?mode=notice&lang=${lang}`);await expect(page.locator('p[role="status"]')).toContainText("500");checks++;}
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,"verification.json"),JSON.stringify({checks,errors,scope:"Real UI components; synthetic HTTP only, no production writes, messages or payments"},null,2));console.log(`Saudi/mobile UI checks: ${checks} passed.`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
