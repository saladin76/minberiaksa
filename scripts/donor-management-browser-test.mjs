// Actual components and local HTTP fixtures; no production records, sends or payments.
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const require=createRequire(import.meta.url), output=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||'.artifacts/donor-management');await mkdir(output,{recursive:true});
const langs=['ar','en','tr','fr','de','es','id','pt','ur','sq','it','nl','sv','no','da','ms','ja','zh','hi'];
const messages=Object.fromEntries(await Promise.all(langs.map(async lang=>[lang,{...JSON.parse(await readFile(`i18n/messages/${lang}.json`,'utf8')),ProfileCardUpdate:JSON.parse(await readFile(`i18n/profile-card-update/${lang}.json`,'utf8'))}])));
const mocks={
 'next/link':`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
 'next/navigation':`export function useSearchParams(){return new URLSearchParams(location.search)}`,
 '@/context/ViewUserProfileContext':`export function useViewUserProfile(){return {openUserProfile:()=>{}}}`,
};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';import PaymentCards from './components/minbar/account/PaymentCards';import Requests from './app/(dashboard)/dashboard/subscription-requests/page';import{RecurringHealthPanel}from'./components/dashboard/RecurringHealthPanel';import{setDashLocale}from'./lib/dashboard/i18n';const params=new URLSearchParams(location.search),lang=params.get('lang')||'ar';setDashLocale(lang);createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={lang} messages={window.fixtureMessages} onError={error=>window.fixtureErrors.push(error.message)} timeZone='Europe/Istanbul'>{params.get('surface')==='health'?<RecurringHealthPanel/>:params.get('surface')==='requests'?<Requests/>:<PaymentCards locale={lang}/>}</NextIntlClientProvider>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'boundaries',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:null);builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['components/minbar/account/PaymentCards.tsx','components/dashboard/RecurringHealthPanel.tsx','components/dashboard/SubscriptionRequestsPanel.tsx','app/(dashboard)/dashboard/subscription-requests/page.tsx','components/dashboard/PageHeader.tsx','components/ui/*.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
const id='a'.repeat(24), donor='b'.repeat(24), subscription='c'.repeat(24), requests=[],errors=[];
let cards=[],blockDelete=true, failCards=false, requestStatus='NEW';
const initialCard=()=>({id,last4:'4242',cardType:'VISA',expiryDate:'12/35',isDefault:false,nickname:'Travel'});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture'),json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(url.pathname.startsWith('/api/')){
  let body=null;if(req.method!=='GET'&&req.method!=='DELETE'){let text='';for await(const chunk of req)text+=chunk;body=JSON.parse(text);}
  requests.push({path:url.pathname,method:req.method,body});
  if(url.pathname==='/api/credit-cards'){
   if(req.method==='GET')return failCards?json({error:'Unavailable'},503):json({cards});
   assert.equal(body.cardNumber,'4242424242424242');assert.equal(body.cvc,'123');cards.push({...initialCard(),id:'d'.repeat(24),nickname:null});return json({card:{id:'d'.repeat(24)}});
  }
  if(url.pathname===`/api/credit-cards/${id}`){
   if(req.method==='DELETE'){if(blockDelete)return json({error:'CARD_IN_USE'},409);cards=[];return json({success:true});}
   assert.equal(req.method,'PATCH');cards=cards.map(card=>({...card,...body}));return json({card:{id,nickname:cards[0].nickname,isDefault:cards[0].isDefault}});
  }
  if(url.pathname==='/api/admin/subscription-requests'){
   if(req.method==='PATCH'){requestStatus=body.status;return json({ok:true,updatedAt:'2030-01-01T00:01:00Z',billingChanged:false});}
   const status=url.searchParams.get('status'),shown=status==='OPEN'||status===requestStatus;
   return json({requests:shown?[{id,donorId:donor,donorName:'Fixture Donor',subscriptionId:subscription,kind:'CANCEL',status:requestStatus,frequency:'MONTHLY',currency:'USD',currentAmount:10,requestedAmount:null,note:'Please stop the recurring donation',staffNote:'',resolutionNote:'',createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',history:[],canComplete:false}]:[],openCount:1,pagination:{total:shown?1:0,pages:1}});
  }
  if(url.pathname==='/api/admin/subscriptions/health')return json({checkedAt:'2030-01-01T00:00:00Z',complete:true,schedulerState:'recent',groups:[],providers:{ALBARAKA:{enabled:true,signupReady:true}},schedule:{counts:{scheduled:46,due:0},next24Hours:1,nextScheduledAt:'2030-01-02T06:00:00Z'},renewals:{complete:true,groups:[{provider:'ALBARAKA',frequency:'MONTHLY',confirmed:3,declined:2,unresolved:0,notCollected:0,latestConfirmedAt:'2030-01-01T00:00:00Z',lastDeclineCode:'05'}]},lastCheck:{createdAt:'2030-01-01T00:00:00Z',messageAr:'Fixture scheduler'}});
  return json({error:'Unexpected request'},404);
 }
 const lang=url.searchParams.get('lang')||'ar';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang='${lang}' dir='${['ar','ur'].includes(lang)?'rtl':'ltr'}'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/style.css'><style>:root{--radius:.75rem}body{margin:16px;font-family:Arial,sans-serif;background:#f8fafc}#root{max-width:1100px;margin:auto}</style></head><body><div id='root'></div><script>window.fixtureMessages=${JSON.stringify(messages[lang]).replace(/</g,'\\u003c')};window.fixtureErrors=[];</script><script src='/fixture.js'></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});let checks=0,activePage;
try{
 for(const lang of langs)for(const width of [390,1440]){
  cards=[initialCard()];blockDelete=true;failCards=false;
  const page=await browser.newPage({viewport:{width,height:950}});activePage=page;page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{assert.ok(req.url().startsWith(origin),'No external requests');});
  const cp=messages[lang].ProfileCardUpdate;await page.goto(`${origin}/?lang=${lang}`);await expect(page.getByLabel(cp.nickname)).toHaveValue('Travel');await page.getByLabel(cp.nickname).locator('xpath=ancestor::details').locator('summary').click();await expect(page.getByLabel(cp.nickname)).toBeVisible();checks++;
  await page.getByLabel(cp.nickname).fill('Family');await page.getByRole('button',{name:cp.save,exact:true}).first().click();await expect(page.getByRole('status')).toHaveText(cp.saved);await expect(page.getByLabel(cp.nickname)).toHaveValue('Family');checks++;
  await page.getByRole('button',{name:cp.makeDefault,exact:true}).click();await expect(page.getByText(cp.defaultCard,{exact:true})).toBeVisible();checks++;
  await page.locator('details').filter({has:page.locator('button').filter({hasText:cp.confirmRemove})}).locator('summary').click();await page.getByRole('button',{name:cp.confirmRemove,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(cp.cardInUse);await expect(page.getByLabel(cp.nickname)).toBeVisible();checks++;
  blockDelete=false;await page.getByRole('button',{name:cp.confirmRemove,exact:true}).click();await expect(page.getByText(cp.emptyCards,{exact:true})).toBeVisible();checks++;
  await page.getByText(cp.addCard,{exact:true}).click();await page.getByLabel(messages[lang].cart.cardNumber,{exact:true}).fill('4242424242424242');await page.getByLabel(messages[lang].cart.cardExpiry,{exact:true}).fill('1235');await page.getByLabel(messages[lang].cart.cardHolder,{exact:true}).fill('Fixture Donor');await page.getByLabel('CVC',{exact:true}).fill('123');await page.getByRole('button',{name:cp.save,exact:true}).click();await expect(page.getByLabel('CVC',{exact:true})).toHaveValue('');await expect(page.getByLabel(cp.nickname)).toBeVisible();checks++;
  assert.deepEqual(await page.evaluate(()=>window.fixtureErrors),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks+=2;
  if(['ar','en','tr'].includes(lang))await page.screenshot({path:path.join(output,`${lang}-cards-${width}.png`),fullPage:true});
  failCards=true;await page.reload();await expect(page.getByRole('alert')).toHaveText(cp.error);await expect(page.getByText(cp.emptyCards,{exact:true})).toHaveCount(0);checks++;
  await page.close();
 }
 for(const lang of ['ar','en','tr'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:950}});activePage=page;page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/?lang=${lang}&surface=health`);const detail=page.locator('[data-recurring-readiness]');await expect(detail.locator('summary').first()).toContainText('46');assert.equal(await detail.getAttribute('open'),null);assert.ok((await detail.boundingBox()).height<180);checks+=2;
  await page.screenshot({path:path.join(output,`${lang}-readiness-collapsed-${width}.png`),fullPage:true});await detail.locator('summary').first().click();await expect(detail.locator('div').filter({hasText:'ALBARAKA'}).first()).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks+=2;await page.screenshot({path:path.join(output,`${lang}-readiness-${width}.png`),fullPage:true});
  await page.goto(`${origin}/?lang=${lang}&surface=requests`);await page.getByText('Fixture Donor',{exact:true}).waitFor();await expect(page.locator('#subscription-requests')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks+=2;await page.screenshot({path:path.join(output,`${lang}-requests-${width}.png`),fullPage:true});
  assert.deepEqual(await page.evaluate(()=>window.fixtureErrors),[]);await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'verification.json'),JSON.stringify({checks,errors,languages:langs.length,productionRequests:0,bankCalls:0,paymentCaptures:0,recipientMessages:0},null,2));console.log(`Donor management browser checks: ${checks} passed`);
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error((await activePage.locator('body').innerText()).slice(0,3500));}throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
