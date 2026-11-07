// Isolated UI fixtures: no production database, providers or recipient messages.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url), output=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/donation-experience");
await mkdir(output,{recursive:true});
const catalogs={en:require("../lib/dashboard/i18n/catalog/en.json"),tr:require("../lib/dashboard/i18n/catalog/tr.json")};
const label=(locale,text)=>locale==="ar"?text:catalogs[locale][text]||text;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';import{setDashLocale}from'./lib/dashboard/i18n';import CartPage from './components/minbar/cart/CartPage';import Notifications from './app/(dashboard)/dashboard/notifications/page';import{DonationFinancialStatus}from'./components/dashboard/DonationFinancialStatus';import{DonationGatewayBadge}from'./components/dashboard/DonationGatewayBadge';import{DonationSourceBadge}from'./components/dashboard/DonationSourceBadge';import ar from './i18n/messages/ar.json';import en from './i18n/messages/en.json';import tr from './i18n/messages/tr.json';const q=new URLSearchParams(location.search),lang=q.get('lang')||'ar',surface=q.get('surface');setDashLocale(lang);const bank=(provider)=>({id:provider,provider,paidAt:'2026-11-01'});const status=(state,returned,remaining)=>({status:'PAID',paidAt:'2026-11-01',financialSummary:{state,returnedMinor:returned,remainingMinor:remaining,currency:'USD'}});function App(){return surface==='cart'?<NextIntlClientProvider locale={lang} messages={{ar,en,tr}[lang]} timeZone='Europe/Istanbul'><CartPage projects={[]} categories={[]}/></NextIntlClientProvider>:surface==='notifications'?<Notifications/>:<div className='space-y-6 rounded-xl border bg-white p-5'><div className='flex flex-wrap gap-6'><DonationGatewayBadge donation={bank('ALBARAKA')} onOpen={()=>{}}/><DonationGatewayBadge donation={bank('PAYFOR')} onOpen={()=>{}}/></div><div className='flex flex-wrap gap-6'><DonationFinancialStatus donation={status('REFUNDED',1000,0)}/><DonationFinancialStatus donation={status('PARTIALLY_REFUNDED',300,700)}/><DonationFinancialStatus donation={status('VOIDED',1000,0)}/></div><div className='flex flex-wrap gap-6'><DonationSourceBadge attribution={null} status='PAID'/><DonationSourceBadge attribution={{utm_source:'whatsapp',utm_campaign:'Gaza November',utm_medium:'message'}} status='PAID'/></div></div>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},plugins:[{name:"next-fixture",setup(b){
  b.onResolve({filter:/^@\/context\/CurrencyContext$/},()=>({path:"currency",namespace:"fixture"}));
  b.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:"fixture"}));
  b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="currency"?"export function useCurrency(){return {getSelectedCurrency:()=> 'USD',convertToCurrency:n=>({convertedValue:n,currency:'USD',exchangeRate:1}),convertToUSD:n=>n}}":args.path==="next/navigation"?"export function useRouter(){return {push(){},replace(){},prefetch(){}}};export function usePathname(){return location.pathname};export function useParams(){return {locale:new URLSearchParams(location.search).get('lang')||'ar'}};export function useSearchParams(){return new URLSearchParams(location.search)}":args.path==="next/image"?"import React from 'react';export default function Image({priority,unoptimized,...props}){return <img {...props}/>}":"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}",loader:"tsx",resolveDir:process.cwd()}));
}}]});
let css=(await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:[{raw:entry,extension:"tsx"},"components/dashboard/Donation{FinancialStatus,GatewayBadge,SourceBadge}.tsx","components/dashboard/PageHeader.tsx","components/ui/*.tsx","app/(dashboard)/dashboard/notifications/page.tsx"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined})).css;
css+=await readFile("styles/minbar/minbar.css","utf8");
css+=`@font-face{font-family:Fixture;src:url('/font.woff2');font-weight:200 1000}body{--radius:.7rem;margin:0;background:#f8fafc;font-family:Fixture,Arial,sans-serif}#root{max-width:1180px;margin:auto;padding:16px}`;
const ids=["a".repeat(24),"b".repeat(24)];let read=false,writeCount=0;
const event=(index)=>({id:"payment:"+ids[index],at:"2026-11-01T12:00:00Z",title:"تبرع مؤكد",message:"1.00 USD",kind:"payment",href:"/dashboard?donationId="+ids[index],read});
const server=createServer(async(req,res)=>{const url=new URL(req.url,"http://fixture"),json=value=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(value));};
  if(url.pathname==="/fixture.js"){res.setHeader("Content-Type","application/javascript");return res.end(bundle.outputFiles[0].contents);}
  if(url.pathname==="/style.css"){res.setHeader("Content-Type","text/css");return res.end(css);}
  if(url.pathname==="/font.woff2"){res.setHeader("Content-Type","font/woff2");return res.end(await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2"));}
  if(url.pathname.startsWith("/banks/")){res.setHeader("Content-Type","image/png");return res.end(await readFile("public"+url.pathname));}
  if(url.pathname==="/api/global-settings")return json({teamSupportEnabled:false,cartUpsell:{items:[]}});
  if(url.pathname==="/api/admin/site-notifications"){
    if(req.method==="POST"){req.resume();read=true;writeCount++;return json({ok:true});}
    return json({items:[event(url.searchParams.has("before")?1:0)],unread:read?0:2,nextBefore:url.searchParams.has("before")?null:"fixture-cursor"});
  }
  if(url.pathname.startsWith("/api/")){res.statusCode=404;return json({error:"Unexpected fixture API"});}
  const lang=url.searchParams.get("lang")||"ar";res.setHeader("Content-Type","text/html; charset=utf-8");res.end(`<!doctype html><html lang="${lang}" dir="${lang==="ar"?"rtl":"ltr"}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="${url.searchParams.get("surface")==="cart"?"mia-scope":"dash-vivid"}"><div id="root"></div><script src="/fixture.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:["--no-sandbox","--disable-dev-shm-usage"]});const errors=[];let checks=0;
try{for(const lang of ["ar","en","tr"])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.on("pageerror",error=>{errors.push(error.message);console.error(error.message);});
  await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.addInitScript(()=>{localStorage.setItem("mia_cart_schema","2");localStorage.setItem("mia_cart_items",JSON.stringify(["daily","friday","monthly"].map((freqKey,index)=>({projectId:String(index),title:"مشروع تجريبي",typeKey:"project",freqKey,amount:1,currency:"USD"}))));});
  await page.goto(origin+`/?surface=cart&lang=${lang}`);await expect(page.locator(".cart-row")).toHaveCount(3);
  for(const index of [0,1])await expect(page.locator(`#cart-row-${index} .cart-monthly`)).toBeDisabled();await expect(page.locator("#cart-row-2 .cart-monthly")).toBeEnabled();checks++;
  const messages=require(`../i18n/messages/${lang}.json`);await expect(page.getByRole("status").filter({hasText:messages.validation.mixedDonationCadences})).toHaveCount(0);await expect(page.getByRole("link",{name:messages.cart.checkout,exact:true})).toHaveAttribute("href",new RegExp("/"+lang+"/checkout$"));checks++;
  await page.screenshot({path:path.join(output,`${lang}-${width}-cart.png`),fullPage:true});
  await page.goto(origin+`/?surface=summary&lang=${lang}`);await expect(page.getByText(label(lang,"مسترد بالكامل"),{exact:true})).toBeVisible();await expect(page.getByText(label(lang,"مسترد جزئيًا"),{exact:true})).toBeVisible();await expect(page.getByText(label(lang,"ملغاة لدى البنك"),{exact:true})).toBeVisible();await expect(page.locator('img[alt="Albaraka Türk"]')).toBeVisible();assert.equal(await page.locator("img").evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0)),true);checks++;
  await page.screenshot({path:path.join(output,`${lang}-${width}-summary.png`),fullPage:true});
  read=false;await page.goto(origin+`/?surface=notifications&lang=${lang}`);await expect(page.locator("article")).toHaveCount(1);await page.getByRole("button",{name:label(lang,"عرض المزيد"),exact:true}).click();await expect(page.locator("article")).toHaveCount(2);checks++;
  await page.getByRole("button",{name:label(lang,"تحديد الكل كمقروء"),exact:true}).click();await expect(page.getByRole("button",{name:label(lang,"تحديد الكل كمقروء"),exact:true})).toBeDisabled();checks++;
  for(const surface of ["notifications"]){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(output,`${lang}-${width}-${surface}.png`),fullPage:true});}
  await context.close();
}assert.deepEqual(errors,[]);assert.equal(writeCount,6);console.log(JSON.stringify({checks,localReadMarkerWrites:writeCount,providerCalls:0,productionWrites:0,errors,screenshots:output}));}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
