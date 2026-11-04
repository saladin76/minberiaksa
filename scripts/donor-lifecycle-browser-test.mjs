// Actual donor profile and public rich-content renderer, isolated HTTP data only.
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const require = createRequire(import.meta.url), output = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || '.artifacts/donor-lifecycle');
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{UserDonationsTable}from'./components/dashboard/UserDonationsTable';import{PublicRichText}from'./components/content/PublicRichText';import{publicRichText}from'./lib/content/public-rich-text';import{setDashLocale}from'./lib/dashboard/i18n';setDashLocale(new URLSearchParams(location.search).get('lang')||'ar');const rich={type:'doc',content:[{type:'heading',attrs:{level:3},content:[{type:'text',text:'أهداف المشروع'}]},...[1,2].map(()=>({type:'orderedList',content:Array.from({length:5},(_,i)=>({type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'هدف '+i,marks:i===0?[{type:'bold'}]:[]}]}]}))}))]};createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).get('surface')==='rich'?<PublicRichText nodes={publicRichText(JSON.stringify(rich))}/>:<UserDonationsTable userId='fixture-donor' formatMoney={value=>'$'+value}/>);`;
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
const css = (await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['components/dashboard/UserDonationsTable.tsx','components/content/PublicRichText.tsx','components/dashboard/DonationFinancialStatus.tsx','components/dashboard/EmptyState.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
const plan = { id:'paid-plan',status:'CANCELLED',lifecycle:'CANCELLED',activated:true,frequency:'MONTHLY',amount:20,currency:'USD',provider:'PAYPAL',lastBillingDate:'2026-11-03T10:00:00Z',nextBillingDate:null,lastChargeError:null,projects:['Project A'] };
const row = { id:'recurring',outcome:'SUCCESS',subscriptionId:plan.id,frequency:'MONTHLY',amount:20,amountUSD:20,currency:'USD',paymentMethod:'PAYPAL',paidAt:'2026-11-03T10:00:00Z',createdAt:'2026-11-03T09:00:00Z',campaigns:[{id:'project',title:'Project A'}],categories:[],referral:null };
const data={subscriptions:[plan,{...plan,id:'pending',status:'ACTIVE',lifecycle:'AWAITING_FIRST_PAYMENT',activated:false,frequency:'DAILY',lastBillingDate:null,lastChargeError:'First capture declined'},{...plan,id:'retry',status:'ACTIVE',lifecycle:'PAYMENT_FAILED',frequency:'FRIDAY',nextBillingDate:'2026-11-05T10:00:00Z',lastChargeError:'Issuer declined renewal'}],rows:[row,{...row,id:'one-time',subscriptionId:null,frequency:null},{...row,id:'failed',outcome:'FAILED',subscriptionId:'pending',paidAt:null}]};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(url.pathname.startsWith('/api/')){assert.equal(req.method,'GET');assert.equal(url.pathname,'/api/users/fixture-donor/donations');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
 const lang=url.searchParams.get('lang')||'ar';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang='${lang}' dir='${lang==='ar'?'rtl':'ltr'}'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/style.css'></head><body style='margin:12px;font-family:Arial'><div id='root'></div><script src='/fixture.js'></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const catalog={en:require('../lib/dashboard/i18n/catalog/en.json'),tr:require('../lib/dashboard/i18n/catalog/tr.json')},label=(lang,text)=>catalog[lang]?.[text]||text;
let checks=0;const errors=[];
try {
 for(const lang of ['ar','en','tr'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>assert.ok(request.url().startsWith(origin),'No external requests'));
  await page.goto(`${origin}/?lang=${lang}`);
  await expect(page.getByText(label(lang,'لم يتفعّل — لا توجد دفعة مؤكدة'),{exact:true})).toBeVisible();checks++;
  await expect(page.getByText(label(lang,'معلق — تعثر التجديد'),{exact:true})).toBeVisible();checks++;
  await expect(page.getByText('Issuer declined renewal',{exact:false})).toBeVisible();checks++;
  await expect(page.locator('tbody tr')).toHaveCount(2);checks++;
  await expect(page.locator('tbody').getByText(label(lang,'ملغي'),{exact:true})).toBeVisible();checks++;
  await page.getByRole('button',{name:label(lang,'مرة واحدة'),exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);checks++;
  await expect(page.locator('tbody').getByText(label(lang,'ملغي'),{exact:true})).toHaveCount(0);checks++;
  await page.getByRole('button',{name:label(lang,'دوري'),exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);checks++;
  await page.getByRole('button',{name:new RegExp('^'+label(lang,'الكل')+' ')}).click();await expect(page.locator('tbody tr')).toHaveCount(2);checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
  await page.screenshot({path:path.join(output,`${lang}-profile-${width}.png`),fullPage:true});
  await page.goto(`${origin}/?surface=rich&lang=${lang}`);await expect(page.locator('ol')).toHaveCount(2);await expect(page.locator('li')).toHaveCount(10);await expect(page.locator('strong')).toHaveCount(2);await expect(page.locator('h3')).toHaveCount(1);checks+=4;
  await page.screenshot({path:path.join(output,`${lang}-rich-${width}.png`),fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'verification.json'),JSON.stringify({checks,errors,productionRequests:0,paymentCaptures:0,recipientMessages:0},null,2));console.log(`Donor lifecycle and public rich text: ${checks} browser checks passed`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
