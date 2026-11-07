import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const require=createRequire(import.meta.url),artifacts=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||'.artifacts','google-search-recovery');await mkdir(artifacts,{recursive:true});
const dict={en:require('../lib/dashboard/i18n/catalog/en.json'),tr:require('../lib/dashboard/i18n/catalog/tr.json')},label=(locale,key)=>locale==='ar'?key:dict[locale][key]||key;
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{setDashLocale}from'./lib/dashboard/i18n';import{SearchPlanRecovery}from'./app/(dashboard)/dashboard/marketing/google-search/SearchPlanRecovery';const q=new URLSearchParams(location.search),locale=q.get('lang')||'ar';setDashLocale(locale);document.documentElement.dir=locale==='ar'?'rtl':'ltr';function App(){const [plan,setPlan]=useState({id:'aaaaaaaaaaaaaaaaaaaaaaaa',version:1,status:'PARTIAL_PROVIDER_STATE',request:{dailyBudget:10},resources:{campaigns:['customers/1234567890/campaigns/1']}});return <main className="p-4"><SearchPlanRecovery plan={plan} disabled={q.get('busy')==='1'} onUpdated={setPlan}/><output id="state">{plan.status}:{plan.version}</output></main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:path.resolve('tsconfig.json'),define:{'process.env.NODE_ENV':'"test"','process.env':'{}'}});
const css=(await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['app/(dashboard)/dashboard/marketing/google-search/*.tsx','components/dashboard/content-editor/EditorModal.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
const font=await readFile('public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2'),latin=await readFile('public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2');
const posts=[],errors=[],unexpected=[];let rejectPause=false,holdAdoption=false,pendingAdoption=null;
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://fixture');const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/api/admin/google-search'){
  if(req.method==='GET')return json({review:{readOnly:true,currency:'USD',providerDailyBudget:25,missingResources:[],campaigns:[{resource:'customers/1234567890/campaigns/1',name:'Current Google campaign',status:'PAUSED',dailyBudget:25}],providerMutations:0}});
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);posts.push(body);if(rejectPause&&body.action==='pause')return json({error:'GOOGLE_ADS_OUTCOME_UNKNOWN',uncertain:true},502);
  if(holdAdoption&&body.action==='adopt-provider-budget'){pendingAdoption=()=>json({plan:{id:body.id,version:2,status:'ACTIVE',request:{dailyBudget:25},resources:{campaigns:['customers/1234567890/campaigns/1']}}});return;}
  if(holdAdoption&&body.action==='pause'){json({plan:{id:body.id,version:3,status:'PAUSED',request:{dailyBudget:25},resources:{campaigns:['customers/1234567890/campaigns/1']}}});setTimeout(()=>{pendingAdoption?.();pendingAdoption=null;},50);return;}
  return json({plan:{id:body.id,version:2,status:'PAUSED',request:{dailyBudget:body.newDailyBudget||10},resources:{campaigns:['customers/1234567890/campaigns/1']}}});
 }
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}
 if(url.pathname==='/ar.woff2')return res.end(font);if(url.pathname==='/latin.woff2')return res.end(latin);
 if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);return json({error:'UNMOCKED_ROUTE'},404);}
 res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--brand:10 61% 40%;--border:214 25% 86%;}@font-face{font-family:Cairo;src:url(/ar.woff2);unicode-range:U+0600-06FF;}@font-face{font-family:Cairo;src:url(/latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Cairo,system-ui;}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,activePage,checks=0;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const locale of ['ar','en','tr'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});activePage=page;page.on('pageerror',error=>errors.push(error.message));const origin=`http://127.0.0.1:${server.address().port}/?lang=${locale}`;
  await page.goto(origin+'&busy=1');const pause=page.getByRole('button',{name:label(locale,'إيقاف فوري'),exact:true});await expect(pause).toBeDisabled();await page.getByLabel(label(locale,'أوافق على إيقاف عرض حملات هذه الخطة فورًا وتعطيل متابعتها التلقائية.'),{exact:true}).check();await expect(pause).toBeEnabled();checks++;
  await pause.click();await expect(page.locator('#state')).toHaveText('PAUSED:2');assert.equal(posts.at(-1).action,'pause');assert.equal(posts.at(-1).version,1);checks++;
  await page.goto(origin);await page.getByRole('button',{name:label(locale,'اعتماد ميزانية Google الحالية'),exact:true}).click();const dialog=page.getByRole('dialog'),submit=dialog.getByRole('button',{name:label(locale,'اعتماد وتنفيذ'),exact:true});await expect(dialog).toContainText('25 USD');await expect(submit).toBeDisabled();checks++;
  await dialog.getByRole('checkbox').check();await expect(submit).toBeEnabled();await submit.click();await expect(dialog).toHaveCount(0);assert.equal(posts.at(-1).confirmation,'ADOPT_PROVIDER_BUDGET');assert.equal(posts.at(-1).newDailyBudget,25);assert.equal(posts.at(-1).currency,'USD');checks++;
  rejectPause=true;await page.goto(origin+'&busy=1');await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:label(locale,'إيقاف فوري'),exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('#state')).toHaveText('PARTIAL_PROVIDER_STATE:1');rejectPause=false;checks++;
  holdAdoption=true;await page.goto(origin);await page.getByRole('button',{name:label(locale,'اعتماد ميزانية Google الحالية'),exact:true}).click();
  const changing=page.getByRole('dialog');await expect(changing).toContainText('25 USD');await changing.getByRole('checkbox').check();
  const late=page.waitForResponse(response=>response.request().method()==='POST'&&response.request().postDataJSON()?.action==='adopt-provider-budget');
  await changing.getByRole('button',{name:label(locale,'اعتماد وتنفيذ'),exact:true}).click();await changing.getByRole('button',{name:label(locale,'العودة للإيقاف الطارئ'),exact:true}).click();await expect(changing).toHaveCount(0);
  await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:label(locale,'إيقاف فوري'),exact:true}).click();await late;await expect(page.locator('#state')).toHaveText('PAUSED:3');holdAdoption=false;checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;await page.screenshot({path:path.join(artifacts,`${locale}-${width}.png`),fullPage:true,animations:'disabled'});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);const report={checks,languages:['ar','en','tr'],widths:[390,1440],providerCalls:0,productionWrites:0,errors};await writeFile(path.join(artifacts,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){if(activePage)await activePage.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
