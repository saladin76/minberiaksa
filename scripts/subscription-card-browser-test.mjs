import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),id='a'.repeat(24),verificationId='b'.repeat(24),cardId='c'.repeat(24);
const output=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||'.artifacts/subscription-card');await mkdir(output,{recursive:true});
const messages=Object.fromEntries(await Promise.all(['ar','en','tr'].map(async lang=>[lang,{...JSON.parse(await readFile(`i18n/messages/${lang}.json`,'utf8')),ProfileCardUpdate:JSON.parse(await readFile(`i18n/profile-card-update/${lang}.json`,'utf8'))}])));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {SubscriptionCardChange,SubscriptionCardChangeResult} from './components/minbar/account/SubscriptionCardChange';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={document.documentElement.lang} messages={window.fixtureMessages} timeZone='Europe/Istanbul'><SubscriptionCardChangeResult/><SubscriptionCardChange subscriptionId='${id}' locale={document.documentElement.lang}/></NextIntlClientProvider>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
const css=(await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['components/minbar/account/SubscriptionCardChange.tsx','components/minbar/checkout/SavedCardPicker.tsx','components/ui/button.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
let verified=false,rejectForm=false;const requests=[],errors=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture'),json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(url.pathname.startsWith('/api/')){
  let body=null;if(req.method!=='GET'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);}
  requests.push({path:url.pathname,method:req.method,body});
  if(url.pathname==='/api/credit-cards')return req.method==='GET'?json({cards:[{id:cardId,last4:'4242',cardType:'VISA',expiryDate:'12/35',isDefault:true}]}):json({card:{id:cardId}});
  if(url.pathname===`/api/users/me/subscriptions/${id}/card`){
   if(req.method==='GET')return json({verified});
   assert.equal(body.consent,true);assert.equal(body.cardId,cardId);assert.equal(body.cvc,'123');
   return rejectForm?json({error:'BANK_AUTHENTICATION_UNAVAILABLE'},503):json({verificationOnly:true,actionUrl:'https://bank.invalid/3d',fields:{MerchantReturnURL:`https://fixture.invalid/callback?cardVerificationId=${verificationId}`,Fixture:'authentication-only'},paymentCaptures:0});
  }
  return json({error:'Unexpected fixture request'},404);
 }
 const lang=url.searchParams.get('lang')||'ar';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang='${lang}' dir='${lang==='ar'?'rtl':'ltr'}'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/style.css'><style>body{margin:16px;font-family:Arial,sans-serif}#root{max-width:650px;margin:auto}</style></head><body><div id='root'></div><script>window.fixtureMessages=${JSON.stringify(messages[lang]).replace(/</g,'\\u003c')};HTMLFormElement.prototype.submit=function(){window.fixturePost={action:this.action,method:this.method,keys:[...this.elements].map(x=>x.name)}};</script><script src='/fixture.js'></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});let checks=0;
try{
 for(const lang of ['ar','en','tr'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),cp=messages[lang].ProfileCardUpdate;page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());
  const before=requests.length;await page.goto(`${origin}/?lang=${lang}`);await expect(page.getByText(cp.title,{exact:true})).toBeVisible();assert.equal(requests.length,before);checks++;
  await page.locator('summary').click();await expect(page.getByRole('radio')).toHaveCount(2);await page.getByRole('radio').first().check();await expect(page.getByLabel(messages[lang].cart.cardNumber,{exact:true})).toHaveCount(0);checks++;
  await page.getByLabel('CVC',{exact:true}).fill('123');rejectForm=true;await page.getByRole('button',{name:cp.submit,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(cp.error);await expect(page.getByLabel('CVC',{exact:true})).toHaveValue('');checks++;
  await page.locator('summary').click();await page.locator('summary').click();await expect(page.getByLabel('CVC',{exact:true})).toHaveValue('');checks++;
  await page.getByLabel('CVC',{exact:true}).fill('123');rejectForm=false;await page.getByRole('button',{name:cp.submit,exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.fixturePost)).toBeTruthy();const post=await page.evaluate(()=>window.fixturePost);assert.equal(post.action,'https://bank.invalid/3d');assert.equal(post.method,'post');assert.equal(requests.slice(before).filter(r=>r.method==='POST').length,2);checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(output,`${lang}-${width}.png`),fullPage:true});checks++;
  verified=false;await page.goto(`${origin}/?lang=${lang}&cardUpdate=success&subscriptionId=${id}&verificationId=${verificationId}`);await expect(page.getByRole('status')).toHaveText(cp.error);checks++;
  verified=true;await page.reload();await expect(page.getByRole('status')).toHaveText(cp.success);checks++;
  await page.goto(`${origin}/?lang=${lang}&cardUpdate=success`);await expect(page.getByRole('status')).toHaveText(cp.error);checks++;
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.path==='/api/credit-cards'||r.path===`/api/users/me/subscriptions/${id}/card`));
 const report={checks,errors,scope:'Actual donor card-change components with synthetic bank redirect and HTTP fixtures',productionRequests:0,bankCalls:0,paymentCaptures:0,recipientMessages:0};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
