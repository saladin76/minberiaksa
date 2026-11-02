import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const require = createRequire(import.meta.url);
const { subscriptionRequestFollowUp, subscriptionRequestCopy } = require('../lib/donations/subscription-request-copy.ts');
const { subscriptionRequestNavigationCopy } = require('../lib/donations/subscription-request-navigation-copy.ts');
const output = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || '.artifacts/project-profile-requests');
await mkdir(output, { recursive: true });
const catA='a'.repeat(24),catB='b'.repeat(24),donor='c'.repeat(24),planId='d'.repeat(24);
const ids=['1','2','3'].map(x=>x.repeat(24));
const closedPlanId='8'.repeat(24);
let projects, tickets, revision=0, profileMode='normal';
const image='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
function reset(){revision=0;profileMode='normal';tickets=[];projects=[
 {id:ids[0],title:'Project A',priority:0,categoryPriorities:{[catA]:1,[catB]:0},categories:[{id:catA,name:'Category A',slug:'a'},{id:catB,name:'Category B',slug:'b'}]},
 {id:ids[1],title:'Project B',priority:1,categoryPriorities:{[catA]:0},categories:[{id:catA,name:'Category A',slug:'a'}]},
 {id:ids[2],title:'Project C',priority:2,categoryPriorities:{[catB]:1},categories:[{id:catB,name:'Category B',slug:'b'}]},
].map((p,index)=>({...p,slug:p.id,baseSlug:p.id,revision:'revision-'+index,searchTitles:[],image,isActive:true,archived:false,targetAmount:100,currentAmount:10,goalType:'FIXED',createdAt:'2026-11-01T12:00:00Z',statuses:{}}));}
reset();
const navigation=`import {useEffect,useState,useMemo} from 'react';export function usePathname(){const [path,setPath]=useState(location.pathname);useEffect(()=>{const update=()=>setPath(location.pathname);addEventListener('popstate',update);return()=>removeEventListener('popstate',update)},[]);return path}export function useSearchParams(){const [search,setSearch]=useState(location.search);useEffect(()=>{const update=()=>setSearch(location.search);addEventListener('popstate',update);return()=>removeEventListener('popstate',update)},[]);return useMemo(()=>new URLSearchParams(search),[search])}export function useRouter(){return {push:window.fixtureNavigate,replace:window.fixtureNavigate,refresh:()=>{}}}export function useParams(){return {locale:window.fixtureLocale}}`;
const mocks={
 'next/navigation':navigation,
 'next/link':`import React from 'react';export default function Link({children,prefetch,scroll,onClick,...props}){return <a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey){event.preventDefault();window.fixtureNavigate(props.href)}}}>{children}</a>}`,
 'next/image':`import React from 'react';export default function Image({src,alt}){return <img src={src} alt={alt}/>}`,
 'next-auth/react':`export function useSession(){return {data:{user:{id:'${donor}',role:'DONOR'}},status:'authenticated'}}export function signOut(){throw new Error('Unexpected sign out')}`,
 '@/context/CurrencyContext':`const currency={getSelectedCurrency:()=> 'USD',convertToCurrency:value=>({convertedValue:value,currency:'USD'}),convertToUSD:value=>value};export function useCurrency(){return currency}`,
 '@/context/ViewUserProfileContext':`export function useViewUserProfile(){return {openUserProfile:()=>{}}}`,
 '@/app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard':`import React from 'react';export function ContentLocalizationAuditCard(){return null}`,
 '@/components/minbar/ProjectDonateCard':`import React from 'react';export default function ProjectDonateCard({project}){return <article data-project-id={project.id}><h3>{project.title}</h3></article>}`,
 '@/components/minbar/banners/ZakatBanner':`export default function Banner(){return null}`,
 '@/components/minbar/banners/TravelBanner':`export default function Banner(){return null}`,
 '@/components/minbar/banners/IbadanBanner':`export default function Banner(){return null}`,
};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';import{usePathname}from'next/navigation';import Header from './components/minbar/shell/Header';import MobileBottomNav from './components/minbar/shell/MobileBottomNav';import ProjectsPage from './components/minbar/projects/ProjectsPage';import Profile from './app/[locale]/profile/page';import{CampaignWorkspaceList}from'./components/dashboard/content-editor/CampaignWorkspaceList';import{setDashLocale}from'./lib/dashboard/i18n';function App(){const pathname=usePathname(),locale=window.fixtureLocale;setDashLocale(locale);return <NextIntlClientProvider locale={locale} messages={window.fixtureMessages} onError={error=>window.fixtureIntlErrors.push(error.message)} timeZone='Europe/Istanbul'>{pathname.startsWith('/dashboard')?<CampaignWorkspaceList/>:<div className='mia-scope'><Header signedIn={window.fixtureSignedIn}/>{pathname.includes('/profile')?<Profile/>:<ProjectsPage projects={window.fixtureProjects} slides={[]} filters={window.fixtureFilters}/>}<MobileBottomNav signedIn={window.fixtureSignedIn}/></div>}</NextIntlClientProvider>}createRoot(document.getElementById('root')).render(<App/>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'framework-boundaries',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'fixture'}:null);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await postcss([tailwindcss({...require('../tailwind.config.ts').default,content:['app/[locale]/profile/**/*.tsx','components/minbar/account/*.tsx','components/dashboard/content-editor/*.tsx','components/ui/*.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css+'\n'+await readFile('styles/minbar/minbar.css','utf8')+'\n'+(await readFile('app/[locale]/globals.css','utf8')).match(/:root\s*\{[\s\S]*?\}/)?.[0];
const messages=Object.fromEntries(await Promise.all(['ar','en','tr'].map(async locale=>[locale,{...JSON.parse(await readFile(`i18n/messages/${locale}.json`,'utf8')),ProfileCardUpdate:JSON.parse(await readFile(`i18n/profile-card-update/${locale}.json`,'utf8'))}])));
const catalogues={en:require('../lib/dashboard/i18n/catalog/en.json'),tr:require('../lib/dashboard/i18n/catalog/tr.json')};
const label=(locale,text)=>locale==='ar'?text:catalogues[locale][text]||text;
const errors=[],writes=[];
const donation={id:'e'.repeat(24),amount:20,totalAmount:20,currency:'EUR',type:'MONTHLY',status:'ACTIVE',paymentStatus:'PAID',paidAt:'2026-10-01T12:00:00Z',createdAt:'2026-10-01T12:00:00Z',subscriptionId:planId,subscriptionProvider:'ALBARAKA',frequency:'MONTHLY',nextBillingDate:'2030-12-01T12:00:00Z',items:[{id:'item',amount:20,campaign:{title:'Project A'}}]};
const statsDonations=[
 donation,
 {...donation,id:'stats-failed-1',paymentStatus:'FAILED',paidAt:null},
 {...donation,id:'stats-failed-2',paymentStatus:'FAILED',paidAt:null},
 {...donation,id:'stats-pending',paymentStatus:'PENDING',paidAt:null},
 {...donation,id:'stats-unsettled',paidAt:null},
 {...donation,id:'stats-oct-repeat',paidAt:'2026-10-03T12:00:00Z'},
 {...donation,id:'stats-daily',frequency:'DAILY',subscriptionId:'daily-plan',paidAt:'2026-11-01T12:00:00Z'},
 {...donation,id:'stats-closed',subscriptionId:closedPlanId,status:'CANCELLED',paidAt:'2026-09-01T12:00:00Z'},
 {...donation,id:'stats-qa',billingReason:'subscription_test_cycle',paidAt:'2026-08-01T12:00:00Z'},
 {...donation,id:'stats-once',type:'ONE_TIME',subscriptionId:null,paidAt:'2026-07-01T12:00:00Z'},
];
const summary={profile:{id:donor,name:'Fixture Donor',email:'fixture@example.test',phone:null,birthdate:null,address:null,memberSince:'2026-01-01T00:00:00Z'},donations:[{id:donation.id,date:donation.paidAt,amount:20,currency:'EUR',titles:['Project A'],recurring:true}],pendingTransfers:[],totalDonatedUSD:22,donationCount:1,activeSubscriptions:1};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents)}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(url.pathname==='/_next/image'){const imagePath=url.searchParams.get('url');if(!imagePath?.startsWith('/minbar/')){res.statusCode=404;return res.end()}res.setHeader('Content-Type','image/png');try{return res.end(await readFile('public'+imagePath))}catch{res.statusCode=404;return res.end()}}
 if(url.pathname.startsWith('/fonts/')){res.setHeader('Content-Type','font/woff2');try{return res.end(await readFile('public'+url.pathname))}catch{res.statusCode=404;return res.end()}}
 if(/\.(png|webp|svg|jpg|ico)$/.test(url.pathname)){const asset=path.resolve('public','.'+url.pathname);if(!asset.startsWith(path.resolve('public')+path.sep)){res.statusCode=404;return res.end()}try{res.setHeader('Content-Type',url.pathname.endsWith('.svg')?'image/svg+xml':'image/'+url.pathname.split('.').at(-1));return res.end(await readFile(asset))}catch{res.statusCode=404;return res.end()}}
 if(url.pathname.startsWith('/api/')){
  let body=null;if(req.method!=='GET'){let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);writes.push({path:url.pathname,body})}
  if(url.pathname==='/api/admin/content-editor/campaigns/workspace-list'){
   if(req.method==='GET')return json({items:projects,nextCursor:null});
   for(const item of body.items){const row=projects.find(p=>p.id===item.id);if(row.revision!==item.revision)return json({error:'CONFLICT'},409)}
   for(const item of body.items){const row=projects.find(p=>p.id===item.id);if(body.categoryId){if(item.order===null)delete row.categoryPriorities[body.categoryId];else row.categoryPriorities[body.categoryId]=item.order}else row.priority=item.order;row.revision='updated-'+(++revision)}
   return json({ok:true});
  }
  if(url.pathname===`/api/users/me/subscriptions/${closedPlanId}/requests`){
   assert.equal(req.method,'GET','A cancelled plan must never submit a request');
   return json({plan:{amount:7,currency:'USD',status:'CANCELLED'},requests:[{id:'7'.repeat(24),kind:'CANCEL',status:'COMPLETED',requestedAmount:null,currency:'USD',note:'Please cancel the old plan',resolutionNote:'The old plan was cancelled.',createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-03T00:00:00Z',history:[{status:'COMPLETED',at:'2026-10-03T00:00:00Z',actorRole:'ADMIN'}]}]});
  }
  if(url.pathname===`/api/users/me/subscriptions/${planId}/requests`){
   if(req.method==='GET')return json({plan:{amount:20,currency:'EUR',status:'ACTIVE'},requests:tickets});
   const now=new Date().toISOString();
   if(req.method==='PATCH'){const row=tickets.find(t=>t.id===body.requestId);assert.equal(row.updatedAt,body.updatedAt);row.status='WITHDRAWN';row.updatedAt=now;row.history.push({status:'WITHDRAWN',at:now,actorRole:'DONOR'});return json({request:row,billingChanged:false})}
   const row={id:(tickets.length?'f':'9').repeat(24),status:'NEW',kind:body.kind,requestedAmount:body.kind==='AMOUNT_CHANGE'?body.amount:null,currency:'EUR',note:body.note,createdAt:now,updatedAt:now,history:[{status:'NEW',at:now,actorRole:'DONOR'}]};tickets.unshift(row);return json({request:row,billingChanged:false},201);
  }
  if(url.pathname==='/api/users/me/account-summary')return json({summary});
  if(url.pathname===`/api/users/${donor}`)return json({user:{id:donor,name:'Fixture Donor',email:'fixture@example.test',donations:profileMode==='stats'?statsDonations:profileMode==='empty'?[]:profileMode==='multi'?[donation,{...donation,id:'6'.repeat(24),createdAt:'2026-09-01T00:00:00Z'},{...donation,id:'5'.repeat(24),subscriptionId:closedPlanId,status:'CANCELLED',currency:'USD',totalAmount:7,items:[]}]:[donation],totalDonationsCount:1,totalDonatedAmountUSD:22,activeSubscriptionsCount:1,badgeIds:[]}});
  return json({error:'Unexpected fixture request '+url.pathname},404);
 }
 if(url.pathname.endsWith('/account')){res.writeHead(307,{Location:url.pathname.replace(/account$/,'profile')+'?tab=overview'});return res.end()}
 profileMode=url.searchParams.get('profileMode')||'normal';
 const locale=url.searchParams.get('lang')||url.pathname.split('/')[1]||'ar',supported=messages[locale]?locale:'ar';
 const filters=[{key:'category:'+catA,id:catA,kind:'category',name:'Category A',slug:'a',icon:'layout-grid',projectIds:[ids[0],ids[1]]},{key:'category:'+catB,id:catB,kind:'category',name:'Category B',slug:'b',icon:'layout-grid',projectIds:[ids[0],ids[2]]}];
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang='${supported}' dir='${supported==='ar'?'rtl':'ltr'}'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/style.css'><style>@font-face{font-family:Cairo;src:url('/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2');font-weight:200 1000}body{margin:0;font-family:Cairo,Arial,sans-serif}*{box-sizing:border-box}#root{max-width:1440px;margin:auto}</style></head><body><div id='root'></div><script>window.fixtureIntlErrors=[];window.fixtureLocale=${JSON.stringify(supported)};window.fixtureSignedIn=${url.searchParams.get('signedOut')!=='1'};window.fixtureMessages=${JSON.stringify(messages[supported]).replace(/</g,'\\u003c')};window.fixtureProjects=${JSON.stringify(projects).replace(/</g,'\\u003c')};window.fixtureFilters=${JSON.stringify(filters)};window.fixtureNavigate=href=>{const url=new URL(href,location.origin);url.searchParams.set('lang',window.fixtureLocale);history.pushState(null,'',url);dispatchEvent(new PopStateEvent('popstate'))};</script><script src='/fixture.js'></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let checks=0,currentPage;
try{
 for(const locale of ['ar','en','tr'])for(const width of [320,390,1440]){
  reset();const context=await browser.newContext({viewport:{width,height:1000},timezoneId:"Europe/Istanbul"}),page=await context.newPage();currentPage=page;
  await page.clock.setFixedTime('2026-11-02T12:00:00Z');page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
  await page.goto(`${origin}/${locale}/bagislar?lang=${locale}`);
  const identities=()=>page.locator('[data-project-id]').evaluateAll(rows=>rows.map(row=>row.dataset.projectId));
  await expect(page.locator('[data-project-id]')).toHaveCount(3);assert.deepEqual(await identities(),ids);checks++;
  await page.getByRole('button',{name:'Category A',exact:false}).click();assert.deepEqual(await identities(),[ids[1],ids[0]]);checks++;
  await page.getByRole('button',{name:'Category B',exact:false}).click();assert.deepEqual(await identities(),[ids[0],ids[2]]);checks++;
  const profileLinks=page.locator(`a[href='/${locale}/profile?tab=donations']`);assert.ok(await profileLinks.count()>=2);await profileLinks.filter({visible:true}).first().click();await expect(page.locator('aside button[aria-current="page"]')).toContainText(messages[locale].Profile.nav.donations);assert.equal(new URL(page.url()).searchParams.get('tab'),'donations');checks++;
  await page.goto(`${origin}/${locale}/profile?tab=donations&lang=${locale}&profileMode=stats`);
  const months=page.getByRole('group',{name:messages[locale].Profile.donations.recurringGivingMonths,exact:true});
  await expect(months.locator('p').nth(1)).toHaveText('3');await expect(months).toContainText(messages[locale].Profile.donations.recurringGivingMonthsHint);await expect(months).not.toContainText(messages[locale].Profile.donations.activeSubscription);checks++;
  const period=page.getByRole('combobox',{name:messages[locale].Profile.donations.timePeriod,exact:true});
  await period.click();await page.getByRole('option',{name:messages[locale].Profile.donations.thisMonth,exact:true}).click();await expect(months.locator('p').nth(1)).toHaveText('1');checks++;
  await period.click();await page.getByRole('option',{name:messages[locale].Profile.donations.thisYear,exact:true}).click();await expect(months.locator('p').nth(1)).toHaveText('3');checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(output,`${locale}-${width}-giving-months.png`),fullPage:true});checks++;
  await page.goto(`${origin}/${locale}/profile?tab=donations&lang=${locale}`);
  const overview=subscriptionRequestFollowUp(locale)[11];const navControl=width<1024?page.getByRole('tab',{name:overview,exact:true}):page.getByRole('button',{name:new RegExp(overview)});
  await navControl.click();await expect(page.locator('.acc-page')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(output,`${locale}-${width}-overview.png`),fullPage:true});assert.equal(new URL(page.url()).searchParams.get('tab'),'overview');checks++;
  const recurringLabel=messages[locale].Profile.nav.subscriptions;await (width<1024?page.getByRole('tab',{name:recurringLabel,exact:true}):page.getByRole('button',{name:new RegExp(recurringLabel)})).click();
  await page.locator(`#profile-subscription-${planId}`).getByRole('button',{name:messages[locale].Profile.subscriptions.manage,exact:true}).click();
  const dialog=page.getByRole('dialog'),copy=subscriptionRequestCopy(locale),follow=subscriptionRequestFollowUp(locale);await expect(dialog.getByRole('combobox')).toBeVisible();await dialog.getByRole('spinbutton').fill('5');await dialog.getByRole('textbox').fill('Please reduce to five');await dialog.getByRole('button',{name:copy[6],exact:true}).click();await expect(dialog.getByText(follow[5],{exact:true})).toBeVisible();await expect(dialog.getByText('9'.repeat(24))).toBeVisible();checks++;
  page.once('dialog',box=>box.accept());await dialog.getByRole('button',{name:follow[2],exact:true}).click();await expect(dialog.getByText(follow[3],{exact:true}).filter({visible:true})).toBeVisible();await expect(dialog.getByRole('button',{name:copy[6],exact:true})).toBeEnabled();checks++;
  const dialogBox=await dialog.boundingBox();assert.ok(dialogBox.width<=width+1&&dialogBox.y>=0&&dialogBox.y+dialogBox.height<=1001);await page.screenshot({path:path.join(output,`${locale}-${width}-request.png`),animations:'disabled'});checks++;
  await dialog.getByRole('button',{name:messages[locale].common.close,exact:true}).click();
  const requestNav=subscriptionRequestNavigationCopy(locale),requestsControl=width<1024?page.getByRole('tab',{name:requestNav.title,exact:true}):page.getByRole('button',{name:new RegExp(requestNav.title)});
  await requestsControl.click();
  const requestSection=page.getByRole('region',{name:requestNav.title,exact:true});
  await expect(requestSection.getByLabel(requestNav.selectPlan,{exact:true})).toHaveValue(planId);await expect(requestSection.getByText(follow[3],{exact:true}).filter({visible:true})).toBeVisible();assert.equal(new URL(page.url()).searchParams.get('tab'),'requests');checks++;
  await requestSection.getByLabel(copy[0],{exact:true}).selectOption('PAUSE');await requestSection.getByRole('button',{name:copy[6],exact:true}).click();await expect(requestSection.getByText(copy[7],{exact:true})).toBeVisible();await expect(requestSection.getByText(follow[5],{exact:true})).toBeVisible();checks++;
  await page.goto(`${origin}/${locale}/profile?tab=requests&subscriptionId=${planId}&lang=${locale}&profileMode=multi`);
  await expect(page.getByRole('region',{name:requestNav.title,exact:true}).getByLabel(requestNav.selectPlan,{exact:true})).toHaveValue(planId);
  await expect(page.getByLabel(requestNav.selectPlan,{exact:true}).locator('option')).toHaveCount(2);await page.getByRole('region',{name:requestNav.title,exact:true}).getByLabel(copy[0],{exact:true}).selectOption('PAUSE');await expect(page.getByText(follow[5],{exact:true})).toBeVisible();checks++;
  await page.getByLabel(requestNav.selectPlan,{exact:true}).selectOption(closedPlanId);await expect(page.getByText('The old plan was cancelled.',{exact:false})).toBeVisible();await expect(page.getByRole('region',{name:requestNav.title,exact:true}).getByRole('button',{name:copy[6],exact:true})).toHaveCount(0);assert.equal(new URL(page.url()).searchParams.get('subscriptionId'),closedPlanId);checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(output,`${locale}-${width}-requests-tab.png`),fullPage:true});checks++;
  await page.goto(`${origin}/${locale}/profile?tab=requests&subscriptionId=${closedPlanId}&lang=${locale}&profileMode=multi`);await expect(page.getByLabel(requestNav.selectPlan,{exact:true})).toHaveValue(closedPlanId);await expect(page.getByText('The old plan was cancelled.',{exact:false})).toBeVisible();checks++;
  await page.goto(`${origin}/${locale}/profile?tab=requests&lang=${locale}&profileMode=empty`);await expect(page.getByText(requestNav.empty,{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:requestNav.title,exact:true}).getByRole('combobox')).toHaveCount(0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));checks++;
  errors.push(...await page.evaluate(()=>window.fixtureIntlErrors));
  await page.goto(`${origin}/dashboard/campaigns?lang=${locale}`);const orderInput=title=>page.getByRole('spinbutton',{name:label(locale,'ترتيب {0}').replace('{0}',title),exact:true}).filter({visible:true});
  await expect(orderInput('Project A')).toHaveValue('0');await orderInput('Project C').fill('0');await page.getByRole('button',{name:label(locale,'حفظ الترتيب'),exact:false}).click();await expect(page.getByRole('status')).toContainText(label(locale,'تم الحفظ وإعادة قراءة القائمة.'));assert.equal(writes.at(-1).body.categoryId,undefined);checks++;
  await page.getByRole('combobox',{name:label(locale,'فلترة التصنيف'),exact:true}).selectOption(catA);await expect(orderInput('Project A')).toHaveValue('1');await orderInput('Project A').fill('0');await page.getByRole('combobox',{name:label(locale,'فلترة التصنيف'),exact:true}).selectOption(catB);await expect(page.getByRole('combobox',{name:label(locale,'فلترة التصنيف'),exact:true})).toHaveValue(catA);checks++;
  await page.getByRole('button',{name:label(locale,'حفظ الترتيب'),exact:false}).click();await expect(page.getByRole('status')).toContainText(label(locale,'تم الحفظ وإعادة قراءة القائمة.'));assert.equal(writes.at(-1).body.categoryId,catA);assert.equal(projects[0].priority,0);assert.equal(projects[0].categoryPriorities[catB],0);checks++;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(output,`${locale}-${width}-ordering.png`),fullPage:true});checks++;
  errors.push(...await page.evaluate(()=>window.fixtureIntlErrors));
  await context.close();
 }
 assert.deepEqual(errors,[]);const report={checks,errors,scope:'Actual public filters, header, profile, account summary, donor requests, and project workspace with synthetic HTTP and framework adapters',productionWrites:0,bankCalls:0,recipientMessages:0};await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){if(currentPage&&!currentPage.isClosed()){console.error((await currentPage.locator('body').innerText()).slice(-5000));await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true})}throw error}
finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
