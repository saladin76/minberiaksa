// Isolated fixtures: no production database, provider calls, messages or payments.
import {build} from "esbuild";
import {chromium, expect} from "@playwright/test";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require=createRequire(import.meta.url);
const {pickNamespaces,SHELL_NAMESPACES}=require("../i18n/locale-messages.ts");
const dictionaries={en:require("../lib/dashboard/i18n/catalog/en.json"),tr:require("../lib/dashboard/i18n/catalog/tr.json")};
const ui=(locale,key)=>locale==="ar"?key:dictionaries[locale][key]||key;
const artifacts=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/content-editor","major-projects");await mkdir(artifacts,{recursive:true});
const id="a".repeat(24),second="b".repeat(24);
const project={id,slug:"fixture",title:"Project",text:"Project description",body:[{kind:"h2",text:"Project details"},{kind:"p",text:"A draft rendered by the public project component."}],image:"/image.svg",images:["/image.svg"],categories:[],region:null,regionLabel:null,raised:345,goal:1000,shares:null,cardAmounts:[25,50,100],suggestedAmounts:[25,50,100],suggestedAmountsByCurrency:null,defaultDonationAmountUSD:null,recommendedFrequency:"monthly",videoUrl:null,priority:0};
const major={id,slug:"major",title:"Major project",subtitle:"Programme",intro:"Draft programme introduction",verseArabic:"",verseTranslation:"",verseAttribution:"",heroImage:"/image.svg",logoImage:"/logo.svg",accentColor:"#7c2318",heroVideoId:"",ctas:[],metaTitle:"",metaDescription:"",blocks:[{key:"grid",kind:"CAMPAIGNS",anchor:"projects",title:"Linked projects",eyebrow:"",subtitle:"",body:"",linkLabel:"",linkUrl:"",image:"",youtubeId:"",campaigns:[project],posts:[],videos:[],playlists:[],courses:[],reports:[],booklets:[],playlist:null}]};
const category={id,slug:"category",pageTemplate:null,name:"Category",description:"Category description",image:"/image.svg",heroImage:"/image.svg",heroVideoId:"",heroLead:"Category lead",ctaLabel:"Support",stats:{done:3,doneLabel:"Done",goal:10,goalLabel:"Goal",percent:30},projectsTitle:"Projects",donateTitle:"Donate",donateNote:"",suggestedAmounts:[25,50,100],suggestedByCurrency:{},donateTarget:null,achievementsTitle:"",values:[],cards:[],projects:[project],achievements:[]};
const article={id,slug:"article",title:"Article",excerpt:"Article introduction",cover:"/image.svg",createdAt:"2026-10-28T00:00:00.000Z",updatedAt:"2026-10-28T00:00:00.000Z",category:null,content:"<h2>Article section</h2><p>Draft article body.</p>",campaignIds:[],baseSlug:"article",seoTitle:"",seoDescription:"",seoKeywords:[],imageAlt:"",isLocalized:true,availableLocales:["ar","en","tr"],localizations:[]};
let rows=[{id,slug:"published",title:"Published programme",heroImage:"",logoImage:"",accentColor:"#7c2318",order:0,isActive:true,translationCount:2,itemCount:3,blockCount:2},{id:second,slug:"draft",title:"Draft programme",heroImage:"",logoImage:"",accentColor:"#7c2318",order:1,isActive:false,translationCount:1,itemCount:1,blockCount:0}];
let ticker={id,isActive:true,showRecentDonations:true,showRegisteredNames:false,donorNames:[],amountRanges:[],minIntervalSeconds:3,maxIntervalSeconds:8};
const requests=[],errors=[];let listFailure=false,liveInterval=3;
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PublicPagePreview} from './components/dashboard/content-editor/PublicPagePreview';import MajorProjects from './app/(dashboard)/dashboard/super-categories/page';import Ticker from './app/(dashboard)/dashboard/ticker/page';import LiveTicker from './components/LiveDonationsTicker';import {NextIntlClientProvider} from 'next-intl';import {setDashLocale} from './lib/dashboard/i18n';const q=new URLSearchParams(location.search);const locale=q.get('lang')||'ar';setDashLocale(["ar","en","tr"].includes(locale)?locale:"en");document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';const surface=q.get('surface')||'preview';const kind=q.get('kind')||'campaigns';createRoot(document.getElementById('root')).render(surface==='majors'?<MajorProjects/>:surface==='ticker'?<Ticker/>:surface==='live'?<NextIntlClientProvider locale={locale} messages={window.fixtureMessages}><LiveTicker/></NextIntlClientProvider>:<PublicPagePreview kind={kind} id='${id}' locale={locale} changes={{title:q.get('title')||'Draft '+locale,name:'Draft '+locale,faqContent:'[{"q":"Draft FAQ","a":"Draft answer"}]'}} settings={q.has('template')?{pageTemplate:q.get('template')}:{}}/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",loader:{".css":"empty"},tsconfig:path.join(process.cwd(),"tsconfig.json"),define:{"process.env.NODE_ENV":'"test"'},plugins:[{name:"fixture-next",setup(builder){
  builder.onResolve({filter:/^next\/(link|navigation|image)$/},args=>({path:args.path,namespace:"next"}));
  builder.onLoad({filter:/.*/,namespace:"next"},args=>({contents:args.path==="next/navigation"?'export function useRouter(){return {push(){},replace(){},refresh(){}}};export function useParams(){return {locale:new URLSearchParams(location.search).get("lang")||"ar"}};export function usePathname(){return location.pathname};export function useSearchParams(){return new URLSearchParams(location.search)}':args.path==="next/image"?'import React from "react";export default function Image({src,alt,...props}){return <img src={src} alt={alt} {...props}/>}':'import React from "react";export default function Link(props){return <a {...props}/>}',loader:"tsx",resolveDir:process.cwd()}));
  builder.onResolve({filter:/^next-auth\/react$/},()=>({path:"session",namespace:"auth"}));
  builder.onLoad({filter:/.*/,namespace:"auth"},()=>({contents:'export function useSession(){return {data:null,status:"unauthenticated"}};export function signIn(){};export function signOut(){}',loader:"js"}));
  builder.onResolve({filter:/^@\/context\/CurrencyContext$/},()=>({path:"currency",namespace:"currency"}));
  builder.onLoad({filter:/.*/,namespace:"currency"},()=>({contents:'const value={getSelectedCurrency:()=>"USD",convertToCurrency:n=>({convertedValue:n,currency:"USD",exchangeRate:1}),convertToUSD:n=>n};export function useCurrency(){return value}',loader:"js"}));
}}]});
if(process.env.CHECK_BUNDLE_ONLY){console.log("Major projects browser bundle: compiled");process.exit(0);}
const css=(await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:["components/dashboard/**/*.tsx","app/(dashboard)/dashboard/{super-categories,ticker}/**/*.tsx","components/ui/*.tsx"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined})).css+await readFile("styles/minbar/minbar.css","utf8")+await readFile("styles/minbar/locale-fonts.css","utf8")+"body{font-family:Cairo,system-ui,sans-serif;margin:0;background:#f8fafc}#root{padding:16px}";
const theme=(await readFile("app/[locale]/globals.css","utf8")).match(/:root\s*\{[\s\S]*?\}/)?.[0]||"";
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://fixture");let body="";for await(const chunk of req)body+=chunk;
 const input=body&&req.headers["content-type"]?.includes("json")?JSON.parse(body):null;requests.push({path:url.pathname,method:req.method,body:input});
 const json=(value,status=200)=>{res.statusCode=status;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(value));};
 if(url.pathname.endsWith("/preview")){const locale=input.locale,kind=url.pathname.split("/")[4];const page=kind==="campaigns"?{...project,title:input.changes.title}:kind==="super-categories"?{...major,title:input.changes.title}:kind==="categories"?{...category,name:input.changes.name,pageTemplate:input.settings.pageTemplate||null}:{...article,title:input.changes.title};return json({kind,page,detail:{donorCount:7,updates:[]},messages:pickNamespaces(locale,[...SHELL_NAMESPACES,"cart","homepage","ProjectExtras","blog","CampaignsPage","certificates","CategoryLanding","aqsa","zakat","quran"])});}
 if(url.pathname==="/api/super-categories/admin")return json(listFailure?{error:"Unavailable"}:{items:rows},listFailure?503:200);
 if(url.pathname.startsWith("/api/super-categories/")&&req.method==="PUT"){rows=rows.map(row=>row.id===url.pathname.split("/").at(-1)?{...row,isActive:input.isActive}:row);return json({ok:true});}
 if(url.pathname.includes("content-localization")||url.pathname.includes("workspace-list"))return json({items:[],total:0,locales:[],summary:{}});
 if(url.pathname==="/api/live-donation-ticker"){
  if(req.method==="PATCH"){ticker={...ticker,...input};return json(ticker);}
  if(url.searchParams.get("view")==="admin")return json(ticker);
  return json({enabled:true,entries:[{key:"payment",source:"DONATION",name:"م***د ع***ي",amount:30,currency:"TRY",at:"2026-10-28T10:00:00Z"},{key:"member",source:"COMMUNITY",name:"A***e S***h",amount:null,currency:null,at:null}],donorNames:[],amountRanges:[],minIntervalSeconds:liveInterval,maxIntervalSeconds:liveInterval});
 }
 if(url.pathname==="/api/categories")return json({items:[]});
 if(url.pathname==="/api/global-settings")return json({allowAnyAmount:false});
 if(url.pathname==="/logo.svg"){res.setHeader("Content-Type","image/svg+xml");return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" rx="20" fill="#e5c484"/></svg>');}
 if(url.pathname==="/image.svg"){res.setHeader("Content-Type","image/svg+xml");return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="1200" height="700" fill="#24535c"/></svg>');}
 const assetPath=url.pathname==="/_next/image"&&url.searchParams.get("url")?.startsWith("/minbar/")?url.searchParams.get("url"):url.pathname;
 if(assetPath.startsWith("/minbar/")||assetPath.startsWith("/fonts/")){const file=path.resolve("public","."+assetPath);if(!file.startsWith(path.resolve("public")+path.sep)){res.statusCode=404;return res.end();}try{const data=await readFile(file);res.setHeader("Content-Type",file.endsWith(".woff2")?"font/woff2":file.endsWith(".svg")?"image/svg+xml":file.endsWith(".png")?"image/png":"image/webp");return res.end(data);}catch{res.statusCode=404;return res.end();}}
 if(url.pathname==="/test.css"){res.setHeader("Content-Type","text/css");return res.end(css+theme);}
 if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","application/javascript");return res.end(bundle.outputFiles[0].text);}
 res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script>window.fixtureMessages=${JSON.stringify(pickNamespaces(url.searchParams.get("lang")||"ar",["LiveDonationsTicker"]))}</script><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,activePage,checks=0;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(const locale of ["ar","en","tr"]){rows=rows.map((row,index)=>({...row,isActive:index===0}));ticker={...ticker,showRegisteredNames:false};const page=await browser.newPage({viewport:{width:1440,height:1050}});activePage=page;page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(15000);await page.context().addCookies([{name:"dash-locale",value:locale,url:origin}]);
  for(const kind of ["campaigns","super-categories","categories","blog"]){
   await page.goto(`${origin}/?surface=preview&lang=${locale}&kind=${kind}`);const frame=page.frameLocator("iframe");await frame.getByRole("heading",{name:"Draft "+locale,exact:true,level:1}).waitFor();
   await frame.getByText("Draft FAQ",{exact:true}).waitFor();await expect.poll(()=>frame.locator("img").first().evaluate(node=>node.naturalWidth)).toBeGreaterThan(0);assert.equal(await page.locator("iframe").evaluate(node=>node.contentDocument.documentElement.lang),locale);checks++;
   if(kind==="campaigns"){assert.equal(await frame.locator("#pd-aside").getAttribute("inert"),"");await frame.getByRole("button").filter({hasText:require(`../i18n/messages/${locale}.json`).ProjectExtras.tabComments}).click();assert.equal(await frame.locator("form").count(),0);await frame.getByRole("button",{name:require(`../i18n/messages/${locale}.json`).projects.tabAbout,exact:true}).click();await frame.locator("body").evaluate(node=>node.ownerDocument.defaultView.scrollTo(0,0));checks++;}
   await page.screenshot({path:path.join(artifacts,`${locale}-${kind}-desktop.png`),fullPage:true,animations:"disabled"});
   await page.getByRole("button",{name:ui(locale,"الموبايل"),exact:true}).click();assert.equal(await page.locator("iframe").evaluate(node=>node.contentWindow.innerWidth),390);assert.equal(await page.locator("iframe").evaluate(node=>node.contentDocument.documentElement.scrollWidth<=390),true);checks++;
   if(kind==="campaigns")for(const width of [390,320]){await page.locator("iframe").evaluate((node,width)=>{node.style.width=width+"px";},width);const clipped=await frame.locator('.mia-main-row button,.mia-main-row a').evaluateAll(nodes=>nodes.filter(node=>{const rect=node.getBoundingClientRect();return rect.width>0&&(rect.left < -1 || rect.right>innerWidth+1);}).map(node=>node.getAttribute("aria-label")||node.textContent));assert.deepEqual(clipped,[],`public header controls fit ${locale} at ${width}px`);checks++;}await page.locator("iframe").evaluate(node=>{node.style.width="390px";});
   await page.screenshot({path:path.join(artifacts,`${locale}-${kind}-mobile.png`),fullPage:true,animations:"disabled"});
  }
  // A real logo has height. Exercise the actual preview with the original and long draft titles.
  const titles=locale==="ar"?["ترميم منازل البلدة القديمة","مشروع ترميم وتأهيل منازل البلدة القديمة في القدس ودعم صمود العائلات والحفاظ على بيوتها وتراثها"]:locale==="tr"?["Eski şehirde evlerin restorasyonu","Eski şehirdeki ailelerin evlerini yenilemek ve kültürel mirasın korunmasına uzun vadeli destek sağlamak"]:["Restoring homes in the Old City","Restoring homes in the Old City and supporting families while preserving their neighbourhood and cultural heritage"];
  for(const title of titles){
   await page.goto(`${origin}/?surface=preview&lang=${locale}&kind=super-categories&title=${encodeURIComponent(title)}`);
   const frame=page.frameLocator("iframe");await frame.getByRole("heading",{name:title,exact:true,level:1}).waitFor();
   await frame.locator(".ib-logo img").evaluate(node=>node.decode());await page.locator("iframe").evaluate(node=>node.contentDocument.fonts.ready);
   for(const width of [390,320]){
    await page.locator("iframe").evaluate((node,width)=>{node.style.width=width+"px";},width);
    const layout=await frame.locator(".ib-page").evaluate(node=>{const logo=node.querySelector(".ib-logo").getBoundingClientRect(),title=node.querySelector("h1").getBoundingClientRect();return {logoBottom:logo.bottom,titleTop:title.top,titleLeft:title.left,titleRight:title.right,width:innerWidth,scroll:document.documentElement.scrollWidth};});
    assert.ok(layout.logoBottom<=layout.titleTop,`logo stays above the title: ${locale} ${width}px ${JSON.stringify(layout)}`);
    assert.ok(layout.titleLeft>=-1&&layout.titleRight<=width+1&&layout.scroll<=width+1,`title and linked project grid fit: ${locale} ${width}px ${JSON.stringify(layout)}`);checks++;
   }
   await page.screenshot({path:path.join(artifacts,`${locale}-major-logo-${titles.indexOf(title)}-320.png`),fullPage:true,animations:"disabled"});
  }
  for(const template of ["aqsa","zakat"]){await page.goto(`${origin}/?surface=preview&kind=categories&template=${template}&lang=${locale}`);await page.frameLocator("iframe").locator("h1").waitFor();await page.screenshot({path:path.join(artifacts,`${locale}-${template}-preview.png`),fullPage:true,animations:"disabled"});checks++;}
  await page.goto(`${origin}/?surface=majors&lang=${locale}`);await page.getByRole("heading",{name:ui(locale,"المشاريع الكبرى"),exact:true}).waitFor();await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("searchbox",{name:ui(locale,"البحث في المشاريع الكبرى"),exact:true}).fill("Published");await expect(page.locator("tbody tr")).toHaveCount(1);checks++;
  await page.getByRole("searchbox").fill("");await page.getByLabel(ui(locale,"حالة النشر"),{exact:true}).selectOption("draft");await expect(page.locator("tbody tr")).toHaveCount(1);checks++;
  await page.getByLabel(ui(locale,"حالة النشر"),{exact:true}).selectOption("all");await page.locator("tbody tr").first().getByRole("switch").click();const write=requests.filter(request=>request.path===`/api/super-categories/${id}`&&request.method==="PUT").at(-1);assert.deepEqual(write.body,{isActive:false});checks++;
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`${locale}-major-list-${width}.png`),fullPage:true,animations:"disabled"});checks++;}
  listFailure=true;await page.getByRole("button",{name:ui(locale,"تحديث"),exact:true}).click();await page.getByRole("alert").waitFor();assert.equal(await page.getByText(ui(locale,"لا توجد مشاريع كبرى مطابقة"),{exact:true}).count(),0);listFailure=false;checks++;
  await page.setViewportSize({width:1440,height:1000});await page.goto(`${origin}/?surface=ticker&lang=${locale}`);await page.getByText(ui(locale,"عرض التبرعات المدفوعة خلال آخر 24 ساعة"),{exact:true}).waitFor();assert.equal(await page.getByRole("textbox",{name:ui(locale,"أسماء العرض الافتراضية"),exact:true}).count(),0);await page.getByText(ui(locale,"عرض أسماء الحسابات المسجلة أيضًا"),{exact:true}).locator("..").getByRole("switch").click();const saved=page.waitForResponse(response=>response.url().includes("live-donation-ticker")&&response.request().method()==="PATCH");await page.getByRole("button",{name:ui(locale,"حفظ الإعدادات"),exact:true}).click();await saved;assert.equal(ticker.showRegisteredNames,true);assert.equal(ticker.donorNames.length,0);checks++;
  await page.screenshot({path:path.join(artifacts,`${locale}-ticker-settings.png`),fullPage:true,animations:"disabled"});
  const tickerWrites=requests.filter(row=>row.path==="/api/live-donation-ticker"&&["POST","PATCH"].includes(row.method)).length;
  let tickerReadFailure="server";await page.route("**/api/live-donation-ticker?view=admin",route=>route.fulfill(tickerReadFailure==="server"?{status:503,contentType:"application/json",body:JSON.stringify({error:"unavailable"})}:{status:404,contentType:"text/html",body:"<html>Not found</html>"}));
  await page.getByRole("button",{name:ui(locale,"تحديث"),exact:true}).click();await page.getByRole("alert").filter({hasText:ui(locale,"تعذر تحميل الإعدادات")}).waitFor();assert.equal(await page.getByRole("button",{name:ui(locale,"حفظ الإعدادات"),exact:true}).isDisabled(),true);assert.equal(await page.getByRole("switch").count(),0);checks++;
  tickerReadFailure="html";await page.getByRole("button",{name:ui(locale,"إعادة المحاولة"),exact:true}).click();await page.getByRole("alert").filter({hasText:ui(locale,"تعذر تحميل الإعدادات")}).waitFor();assert.equal(await page.getByRole("button",{name:ui(locale,"حفظ الإعدادات"),exact:true}).isDisabled(),true);assert.equal(requests.filter(row=>row.path==="/api/live-donation-ticker"&&["POST","PATCH"].includes(row.method)).length,tickerWrites);checks++;
  await page.unroute("**/api/live-donation-ticker?view=admin");ticker={...ticker,minIntervalSeconds:11,maxIntervalSeconds:29};await page.getByRole("button",{name:ui(locale,"إعادة المحاولة"),exact:true}).click();await page.getByLabel(ui(locale,"الحد الأدنى للفاصل (ثوانٍ)"),{exact:true}).waitFor();assert.equal(await page.getByLabel(ui(locale,"الحد الأدنى للفاصل (ثوانٍ)"),{exact:true}).inputValue(),"11");assert.equal(await page.getByLabel(ui(locale,"الحد الأقصى للفاصل (ثوانٍ)"),{exact:true}).inputValue(),"29");checks++;

  await page.goto(`${origin}/?surface=live&lang=${locale}`);await page.getByText("م***د ع***ي",{exact:true}).waitFor();await page.getByText(/TRY|₺/).waitFor();checks++;
  await page.getByText("A***e S***h",{exact:true}).waitFor();const entry=page.locator('[aria-live="polite"]');assert.doesNotMatch(await entry.innerText(),/\$|₺|TRY/);checks++;
  await page.screenshot({path:path.join(artifacts,`${locale}-ticker-community.png`),fullPage:true,animations:"disabled"});
  liveInterval=30;const timedPage=await browser.newPage({viewport:{width:1440,height:1000}});activePage=timedPage;timedPage.on("pageerror",error=>errors.push(error.message));await timedPage.clock.install();await timedPage.route("**/api/categories**",route=>route.abort());const initialFeed=timedPage.waitForResponse(response=>new URL(response.url()).pathname==="/api/live-donation-ticker");await timedPage.goto(`${origin}/?surface=live&lang=${locale}`);await initialFeed;await timedPage.locator('[aria-live="polite"]').waitFor({state:"attached"});
  await timedPage.clock.runFor(1500);await timedPage.getByText("م***د ع***ي",{exact:true}).waitFor();
  const refresh=timedPage.waitForResponse(response=>new URL(response.url()).pathname==="/api/live-donation-ticker");await timedPage.clock.runFor(10000);await refresh;await timedPage.clock.runFor(2000);assert.equal(await timedPage.getByText("A***e S***h",{exact:true}).count(),0,"polling must not shorten the configured 30-second interval");checks++;
  await timedPage.clock.runFor(20000);await timedPage.getByText("A***e S***h",{exact:true}).waitFor();checks++;await timedPage.close();liveInterval=3;await page.close();
 }
 // Other public languages use the same private preview, including long native names.
 for(const locale of require('../lib/locales.ts').SUPPORTED_LOCALES.filter(locale=>!["ar","en","tr"].includes(locale))){
  const page=await browser.newPage({viewport:{width:1440,height:1050}});activePage=page;page.on("pageerror",error=>errors.push(error.message));await page.goto(`${origin}/?surface=preview&lang=${locale}&kind=campaigns`);const frame=page.frameLocator("iframe");await frame.locator("h1").waitFor();await page.locator("iframe").evaluate(node=>node.contentDocument.fonts.ready);
  for(const width of [390,320]){await page.locator("iframe").evaluate((node,width)=>{node.style.width=width+"px";},width);const clipped=await frame.locator('.mia-main-row button,.mia-main-row a').evaluateAll(nodes=>nodes.filter(node=>{const rect=node.getBoundingClientRect();return rect.width>0&&(rect.left < -1 || rect.right>innerWidth+1);}).map(node=>node.getAttribute("aria-label")||node.textContent));assert.deepEqual(clipped,[],`public header controls fit ${locale} at ${width}px`);checks++;}await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,"result.json"),JSON.stringify({checks,errors,productionWrites:0,providerCalls:0},null,2));console.log(`Major projects, previews and ticker browser checks: ${checks} passed`);
}finally{
 if(activePage&&!activePage.isClosed()){
  await activePage.screenshot({path:path.join(artifacts,"last-state.png"),fullPage:true,animations:"disabled"}).catch(()=>{});
  const state=await activePage.evaluate(()=>({url:location.href,body:document.body.innerText,frames:[...document.querySelectorAll("iframe")].map(node=>({body:node.contentDocument?.body?.innerHTML,title:node.title,width:node.clientWidth,height:node.clientHeight}))})).catch(()=>null);
  await writeFile(path.join(artifacts,"last-state.json"),JSON.stringify({errors,state},null,2));
 }
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
