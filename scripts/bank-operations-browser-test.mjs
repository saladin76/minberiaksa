import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), output = process.env.CONTENT_EDITOR_ARTIFACTS || '.artifacts/bank-operations'; await mkdir(output,{recursive:true});
const locales=['ar','en','tr'];
const messages=Object.fromEntries(await Promise.all(locales.map(async locale=>[locale,JSON.parse(await readFile(`i18n/messages/${locale}.json`,'utf8'))])));
const catalogs=Object.fromEntries(await Promise.all(['en','tr'].map(async locale=>[locale,JSON.parse(await readFile(`lib/dashboard/i18n/catalog/${locale}.json`,'utf8'))])));
const replacements={
 'next-intl':'export function useTranslations(ns){return key=>window.fixtureMessages[ns][key]}',
};
const bundle=await build({stdin:{contents:'import React from"react";import{createRoot}from"react-dom/client";import{DonationBankOperations}from"./components/dashboard/DonationBankOperations";import{SavedCardPicker}from"./components/minbar/checkout/SavedCardPicker";function App(){const[value,setValue]=React.useState("card1");return <main><section className="mb-5 rounded-xl border bg-white p-4"><SavedCardPicker cards={[{id:"card1",last4:"1609",cardType:"VISA",expiryDate:"01/31"},{id:"card2",last4:"7313",cardType:"VISA",expiryDate:"01/31"},{id:"card3",last4:"6162",cardType:"MASTERCARD",expiryDate:"03/36"}]} value={value} onChange={setValue}/></section><DonationBankOperations donationId="111111111111111111111111"/></main>}createRoot(document.getElementById("root")).render(<App/>);',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},({path})=>path in replacements?{path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:replacements[path],loader:'tsx'}));}}]});
const css=(await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['components/dashboard/DonationBankOperations.tsx','components/minbar/checkout/SavedCardPicker.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
const initial=()=>({sale:{provider:'ALBARAKA',orderId:'TEST-BANK-ORDER',reference:'TEST-REFERENCE',amountMinor:1000,currency:'EUR'},operations:[],returnedMinor:0,remainingMinor:1000,blocked:false,voided:false,confirmed:true,canManage:true,ready:{ready:true},inquiry:null});
let state=initial(), calls=[], outcome='SUCCEEDED', writes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents)}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(url.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');if(req.method==='GET')return res.end(JSON.stringify(state));
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls.push(body);
  if(body.action==='INQUIRE'){state.inquiry={state:'SUCCEEDED',code:'00',at:new Date().toISOString(),data:{OrderId:'TEST-BANK-ORDER'}};return res.end(JSON.stringify({inquiry:state.inquiry}))}
  writes++;
  if(body.action==='RECONCILE'){const op=state.operations.find(op=>op.id===body.operationId);op.state=body.succeeded?'SUCCEEDED':'DECLINED';op.resolution={evidence:body.evidence};state.blocked=false;if(body.succeeded){state.returnedMinor+=op.amountMinor;state.remainingMinor-=op.amountMinor;}return res.end(JSON.stringify({operation:op}))}
  const amountMinor=body.action==='VOID'?1000:Math.round(Number(body.amount)*100);
  const op={id:`OP-${writes}`,key:body.key,action:body.action,state:outcome,amountMinor,currency:'EUR',actorName:'QA Finance',actorId:'QA',reason:body.reason,code:outcome==='SUCCEEDED'?'00':'TIMEOUT',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};state.operations.push(op);
  if(outcome==='SUCCEEDED'){state.remainingMinor-=amountMinor;state.returnedMinor+=amountMinor;state.voided=body.action==='VOID';}else if(outcome==='UNKNOWN')state.blocked=true;
  return res.end(JSON.stringify({operation:op}));
 }
 const locale=url.searchParams.get('locale')||'ar';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#f7f8fa;font-family:Arial,sans-serif}#root{padding:16px;max-width:1000px;margin:auto}</style><body class="dash-vivid"><div id="root"></div><script>document.cookie="dash-locale=${locale}; path=/";window.fixtureMessages=${JSON.stringify(messages[locale]).replace(/</g,'\\u003c')}</script><script src="/bundle.js"></script></body></html>`)
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(base);await new Promise(()=>{})}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});let checks=0;const errors=[];
try{
 for(const locale of locales)for(const width of [320,390,1440]){
  state=initial();calls=[];writes=0;outcome='SUCCEEDED';const cp=ar=>locale==='ar'?ar:catalogs[locale][ar];
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());await page.goto(`${base}/?locale=${locale}`);
  await page.getByRole('button',{name:cp('استرداد كامل أو جزئي'),exact:true}).waitFor();assert.equal(writes,0);assert.equal(calls.length,0);checks++;
  const sizes=await page.locator('.saved-card-option').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.equal(sizes.length,4);assert.ok(sizes.every(h=>h>=44&&h<=82),JSON.stringify(sizes));checks++;
  await page.getByRole('button',{name:cp('استرداد كامل أو جزئي'),exact:true}).click();const submit=page.getByRole('button',{name:cp('تنفيذ الإجراء البنكي'),exact:true});assert.equal(await submit.isDisabled(),true);
  const amount=page.getByRole('spinbutton');await amount.fill('11');await page.getByRole('textbox').fill('QA donor requested a refund');await page.getByRole('checkbox').check();assert.equal(await submit.isDisabled(),true);assert.equal(writes,0);checks++;
  await amount.fill('3');await submit.dblclick();await page.getByRole('article').filter({hasText:'QA donor requested a refund'}).waitFor();assert.equal(writes,1);assert.equal(state.remainingMinor,700);assert.equal(calls[0].amount,'3');assert.ok(calls[0].key);checks++;
  assert.equal(await page.getByRole('button',{name:cp('إلغاء العملية'),exact:true}).isDisabled(),true);checks++;
  await page.getByRole('button',{name:cp('التحقق من العملية لدى البنك'),exact:true}).click();await page.getByText(cp('آخر استعلام لدى البنك'),{exact:false}).waitFor();assert.equal(writes,1);checks++;
  await page.getByRole('button',{name:cp('استرداد كامل أو جزئي'),exact:true}).click();assert.equal(await page.getByRole('spinbutton').inputValue(),'7.00');await page.getByRole('textbox').fill('QA refund remainder');await page.getByRole('checkbox').check();await submit.click();await page.waitForFunction(()=>document.querySelectorAll('article').length===2);assert.equal(state.remainingMinor,0);assert.equal(writes,2);checks++;
  assert.equal(await page.getByRole('button',{name:cp('استرداد كامل أو جزئي'),exact:true}).isDisabled(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));checks++;
  await page.screenshot({path:`${output}/bank-${locale}-${width}.png`,fullPage:true});await page.close();
 }
 for(const scenario of ['UNKNOWN','DECLINED','unavailable','reader']){
  state=initial();calls=[];writes=0;outcome=scenario; if(scenario==='unavailable')state.ready={ready:false,reason:'BANK_NOT_CONFIGURED'};if(scenario==='reader')state.canManage=false;
  const page=await browser.newPage({viewport:{width:390,height:1000}});await page.route('https://**/*',route=>route.abort());await page.goto(`${base}/?locale=ar`);await page.getByRole('heading',{name:'إدارة العملية البنكية',exact:true}).waitFor();
  if(scenario==='reader'){await page.getByText('الإلغاء والاسترداد متاحان للمدير فقط.').waitFor();assert.equal(await page.getByRole('button',{name:'استرداد كامل أو جزئي',exact:true}).count(),0)}
  else if(scenario==='unavailable'){await page.getByRole('button',{name:'التحقق من العملية لدى البنك',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'استرداد كامل أو جزئي',exact:true}).isDisabled(),true)}
  else{await page.getByRole('button',{name:'إلغاء العملية',exact:true}).click();await page.getByRole('textbox').fill('QA cancellation requested');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'تنفيذ الإجراء البنكي',exact:true}).click();await page.locator('article').waitFor();assert.equal(writes,1);assert.equal(state.remainingMinor,1000);assert.equal(state.blocked,scenario==='UNKNOWN');
   if(scenario==='UNKNOWN'){
    state.operations[0].createdAt=new Date(Date.now()-180000).toISOString();await page.reload();
    const match=page.getByRole('button',{name:'مطابقة نتيجة غير مؤكدة',exact:true});await match.waitFor();assert.equal(await match.isDisabled(),true);
    await page.getByRole('button',{name:'التحقق من العملية لدى البنك',exact:true}).click();await match.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='مطابقة نتيجة غير مؤكدة')?.disabled);await match.click();
    await page.getByRole('combobox').selectOption('true');await page.getByRole('textbox').fill('Bank confirmed cancellation reference QA-123');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'حفظ المطابقة',exact:true}).click();await page.waitForFunction(()=>!document.body.textContent.includes('أؤكد أن النتيجة ومرجعها مطابقان لسجل البنك.'));assert.equal(state.remainingMinor,0);assert.equal(state.blocked,false);assert.equal(calls.filter(x=>x.action==='VOID').length,1);checks+=3;
   }
  }
  checks++;await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,locales,widths:[320,390,1440],productionCalls:0,bankCalls:0,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
