import {build} from "esbuild";
import {chromium} from "@playwright/test";
import {createServer} from "node:http";
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
const id = "507f1f77bcf86cd799439011";
const dictionaries = {en: require("../lib/dashboard/i18n/catalog/en.json"), tr: require("../lib/dashboard/i18n/catalog/tr.json")};
const ui = (locale, value) => locale === "ar" ? value : dictionaries[locale][value] || value;
const artifacts = path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS || ".artifacts/content-editor", "dashboard-followup");
await mkdir(artifacts, {recursive:true});
const bundle = await build({stdin: {contents: `import React,{useState} from "react"; import {createRoot} from "react-dom/client"; import {setDashLocale,dt} from "./lib/dashboard/i18n";
import {DonorProfileEditor} from "./components/dashboard/DonorProfileEditor";
import UsersManagement from "./app/(dashboard)/dashboard/users/_components/UsersManagement";
import {DonorAccountBadge} from "./components/dashboard/DonorAccountBadge";
import {DashboardTopbar} from "./app/(dashboard)/dashboard/_shell/DashboardTopbar";
import {WhatsappInbox} from "./app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox";
import RevenueDashboard from "./app/(dashboard)/dashboard/page";
import TrackingSettingsManager from "./app/(dashboard)/dashboard/platform-connections/tracking/_components/TrackingSettingsManager";
import PaymentGateways from "./app/(dashboard)/dashboard/general/payment-gateways/page";
import {CampaignsTable} from "./app/(dashboard)/dashboard/communication/campaigns/_components/CampaignsTable";
import {SuggestedTeamSupportSection} from "./app/(dashboard)/dashboard/campaigns/_components/SuggestedTeamSupportSection";
import Analytics from "./app/(dashboard)/dashboard/google-analytics/_components/GoogleAnalyticsDashboard";
import {DayOfMonthRevenueGrid} from "./components/dashboard/DayOfMonthRevenueGrid";
import {recurringCalendarMonth,calendarOccurrences,calendarDay,emptyCalendar} from "./lib/dashboard/recurring-calendar";
import TrackingLinkBuilder from "./app/(dashboard)/dashboard/marketing/attribution/_components/TrackingLinkBuilder";
import BankTransfers from "./app/(dashboard)/dashboard/bank-transfers/page";
import Certificates from "./app/(dashboard)/dashboard/certificates/page";
import {ContentLocalizationAuditCard} from "./app/(dashboard)/dashboard/_components/ContentLocalizationAuditCard";
import Donations from "./app/(dashboard)/dashboard/donations/page";
import Badges from "./app/(dashboard)/dashboard/badges/page";
import {EditDonationDialog} from "./components/dashboard/donations/EditDonationDialog";
import {SmartWhatsappDialog} from "./components/dashboard/SmartWhatsappDialog";
import {DonorCommunicationHistory} from "./components/dashboard/DonorCommunicationHistory";
import {TranslationOverview} from "./components/dashboard/content-editor/TranslationOverview";
import {PageSeoEditor} from "./components/dashboard/content-editor/PageSeoEditor";
import QuickDonateBar from "./components/minbar/home/QuickDonateBar";
import {DEFAULT_QUICK_DONATION} from "./lib/minbar/quick-donation";
const params=new URLSearchParams(location.search); const locale=params.get("lang")||((document.cookie.match(/(?:^|; )dash-locale=([^;]+)/)||[])[1])||"ar"; setDashLocale(locale);document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";
function CalendarFixture(){const [month,setMonth]=useState("2026-10"); const window=recurringCalendarMonth(month); const expected=emptyCalendar(window); const collected=emptyCalendar(window); const plan={frequency:"DAILY",nextBillingDate:"2026-10-26T11:30:00Z",timezone:"Europe/Istanbul",scheduleRule:{kind:"daily",hour:14,minute:30}}; for(const date of calendarOccurrences(plan,window)||[]){const cell=expected[calendarDay(date,window)-1];cell.count++;cell.amountUSD++;}if(month==="2026-10"){collected[24].count=1;collected[24].amountUSD=1;} return <DayOfMonthRevenueGrid collected={collected} expected={expected} month={month} onMonthChange={setMonth} formatMoney={value=>"$"+value.toFixed(2)}/>}
function DonorManagementFixture(){return <><DashboardTopbar crumbs={[{label:dt("لوحة التحكم"),href:"/dashboard"},{label:dt("المتبرعون")}]} dir={locale==="ar"?"rtl":"ltr"} onOpenSidebar={()=>{}} onOpenSearch={()=>{}} showWhatsappInbox/><UsersManagement scope="donors"/></>}
function App(){const [open,setOpen]=useState(true);const surface=location.pathname.endsWith("/communication")?"history":location.pathname==="/dashboard/seo-pages"?"seo":params.get("surface")||"analytics";
return <><p id="fixture-nav"/><div className={surface==="quick"?"mia-scope":"p-5"}>{surface==="donorManagement"?<DonorManagementFixture/>:surface==="donorProfile"?<><DonorAccountBadge status="MEMBER"/>{open?<DonorProfileEditor user={{id:"${id}",name:"Fixture donor",email:"fixture@example.test",phone:"+15555555555",countryCode:"TR",countryName:"Türkiye",updatedAt:"2026-10-26T00:00:00.000Z"}} canEditEmail={!params.has("staff")} onClose={()=>setOpen(false)} onSaved={()=>{document.getElementById("fixture-nav").textContent="saved"}}/>:<p>Closed</p>}</>:surface==="topbar"?<DashboardTopbar crumbs={[{label:dt("لوحة التحكم"),href:"/dashboard"},{label:dt("المتبرعون")}]} dir={locale==="ar"?"rtl":"ltr"} onOpenSidebar={()=>{}} onOpenSearch={()=>{}} showWhatsappInbox whatsappInboxCount={27} showGeneralInbox generalInboxCount={8}/>:surface==="inbox"?<WhatsappInbox/>:surface==="summary"?<RevenueDashboard/>:surface==="calendar"?<CalendarFixture/>:surface==="linksAudit"?<TrackingLinkBuilder/>:surface==="bankAudit"?<BankTransfers/>:surface==="certificateAudit"?<Certificates/>:surface==="donations"?<Donations/>:surface==="tracking"?<TrackingSettingsManager canManage={!params.has("viewOnly")} canTest/>:surface==="gateways"?<PaymentGateways/>:surface==="campaigns"?<CampaignsTable campaigns={[{id:"${id}",name:"Fixture campaign with a readable name",channel:"EMAIL",status:"SENT",audienceSegmentKey:"ALL",sentCount:100,deliveredCount:90,readCount:50,clickedCount:12,repliedCount:0,donationCount:2,revenue:150,failedCount:10,createdAt:"2026-10-25T01:00:00Z",updatedAt:"2026-10-25T01:00:00Z"}]} sort={{key:"name",dir:"asc"}} onSort={()=>{}} onChanged={()=>{}}/>:surface==="amounts"?<><SuggestedTeamSupportSection label="Team support amounts" helpText="" defaultPlaceholder="" exceptionsLabel="Exceptions" exceptionsEmptyHint=""/><SuggestedTeamSupportSection label="Project amounts" helpText="" defaultPlaceholder="" exceptionsLabel="Exceptions" exceptionsEmptyHint=""/></>:surface==="donation"?(open&&<EditDonationDialog donationId="${id}" onClose={()=>setOpen(false)} onSaved={()=>{}}/>):surface==="smart"?(open&&<SmartWhatsappDialog open onOpenChange={setOpen} userId="${id}" initialMode="UTILITY"/>):surface==="history"?<DonorCommunicationHistory userId="${id}"/>:surface==="badges"?<Badges/>:surface==="overview"?<TranslationOverview kind="categories"><ContentLocalizationAuditCard section="categories"/></TranslationOverview>:surface==="seo"?<PageSeoEditor/>:surface==="quick"?<QuickDonateBar config={{...DEFAULT_QUICK_DONATION,genericDestinations:["where-needed"],genericProjectIds:params.get("unmapped")?{}:{"where-needed":"${id}"}}} projects={[{id:"${id}",slug:"fixture-project",title:"Fixture project",regionLabel:null}]}/>:<Analytics/>}</div></>};createRoot(document.getElementById("root")).render(<App/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",tsconfig:path.join(process.cwd(),"tsconfig.json"),define:{"process.env.NODE_ENV":'"test"'},plugins:[{name:"fixture-adapters",setup(builder){
  builder.onResolve({filter:/^next\/image$/},()=>({path:"image",namespace:"fixture-image"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-image"},()=>({contents:'import React from "react";export default function Image({src,alt}){return React.createElement("img",{src:typeof src==="string"?src:src?.src,alt})}',loader:"js",resolveDir:process.cwd()}));
  builder.onResolve({filter:/^@\/i18n\/routing$/},()=>({path:"routing",namespace:"fixture-routing"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-routing"},()=>({contents:'import React from "react";export function Link(props){return React.createElement("a",props,props.children)};export function useRouter(){return {push(path){document.getElementById("fixture-nav").textContent=path},replace(){},refresh(){}}}',loader:"js",resolveDir:process.cwd()}));
  builder.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture-next"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-next"},args=>({contents:args.path==="next/link"?'import React from "react";export default function Link(props){return React.createElement("a",props,props.children)}':'import {useMemo} from "react";export function usePathname(){return location.pathname};export function useSearchParams(){return useMemo(()=>new URLSearchParams(location.search),[])};export function useRouter(){return {push(path){document.getElementById("fixture-nav").textContent=path},replace(){},refresh(){}}}',loader:"js",resolveDir:process.cwd()}));
  builder.onResolve({filter:/^next-auth\/react$/},()=>({path:"session",namespace:"fixture-session"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-session"},()=>({contents:'export function useSession(){return {data:{user:{id:"fixture-admin",role:"ADMIN"}},status:"authenticated"}}',loader:"js"}));
  builder.onResolve({filter:/useMinbarMoney$/},()=>({path:"money",namespace:"fixture-money"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-money"},()=>({contents:'export function useMinbarMoney(){return {currency:"USD",symbol:"$",format(value){return "$"+value}}}',loader:"js"}));
  builder.onResolve({filter:/^@\/context\/(CurrencyContext|ViewUserProfileContext)$/},args=>({path:args.path,namespace:"fixture-context"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-context"},args=>({contents:args.path.endsWith("CurrencyContext")?'const currency={getSelectedCurrency:()=>"USD",convertToCurrency:value=>value,convertToUSD:value=>value};export function useCurrency(){return currency}':'export function useViewUserProfile(){return {openUserProfile(){},openUserProfileCard(){}}}',loader:"js"}));
  builder.onResolve({filter:/^next-intl$/},()=>({path:"intl",namespace:"fixture-intl"}));
  builder.onLoad({filter:/.*/,namespace:"fixture-intl"},()=>({contents:'export function useLocale(){return "ar"};export function useTranslations(){return (key)=>key}',loader:"js"}));
}}]});
if(process.env.CHECK_BUNDLE_ONLY){console.log("dashboard followup browser bundle: compiled");process.exit(0)}
const css = (await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:["components/dashboard/**/*.tsx","app/(dashboard)/dashboard/google-analytics/**/*.tsx","app/(dashboard)/dashboard/page.tsx","app/(dashboard)/dashboard/_shell/**/*.tsx","app/(dashboard)/dashboard/users/**/*.tsx","app/(dashboard)/dashboard/badges/**/*.tsx","app/(dashboard)/dashboard/communication/campaigns/**/*.tsx","app/(dashboard)/dashboard/communication/inbox/**/*.tsx","app/(dashboard)/dashboard/general/payment-gateways/**/*.tsx","app/(dashboard)/dashboard/campaigns/_components/SuggestedTeamSupportSection.tsx","components/ui/*.tsx"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined})).css + await readFile("styles/minbar/minbar.css","utf8");
const fonts = {"/fixture-ar.woff2":await readFile("public/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2"),"/fixture-latin.woff2":await readFile("public/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2")};
const theme=(await readFile("app/[locale]/globals.css","utf8")).match(/:root\s*\{[\s\S]*?\}/)?.[0]||"";
const extraCss=theme+'@font-face{font-family:Fixture;src:url(/fixture-ar.woff2);unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF;}@font-face{font-family:Fixture;src:url(/fixture-latin.woff2);unicode-range:U+0000-00FF;}body{font-family:Fixture,system-ui,sans-serif;background:#f8fafc}.mia-scope{--deep:#022;--gold:#d39a27;--muted:#64748b;--border:#e2e8f0;min-height:100vh}';
const report = {summary:{activeUsers:120,totalUsers:150,newUsers:80,sessions:200,screenPageViews:450,engagementRate:.7,bounceRate:.3,keyEvents:42},trend:[{date:"20261023",activeUsers:60,sessions:100,screenPageViews:220},{date:"20261024",activeUsers:80,sessions:100,screenPageViews:230}],pages:[{pagePath:"/ar",pageTitle:"",activeUsers:100,sessions:180,screenPageViews:400}],channels:[{channel:"Paid Social",activeUsers:80,sessions:100,keyEvents:20}],countries:[{country:"Türkiye",activeUsers:80,sessions:100}],devices:[{device:"mobile",activeUsers:90,sessions:130}],exceptions:[],exceptionCount:0,quality:{timezone:"Europe/Istanbul",thresholded:false,sampled:false,dataLoss:false},extended:{campaigns:{rows:[{dimensions:["facebook / paid","Fixture campaign"],metrics:[100,80,20,.7]}],rowCount:1},landingPages:{rows:[{dimensions:["/ar"],metrics:[180,100,40,.3]}],rowCount:1},events:{rows:[{dimensions:["page_view"],metrics:[450,0]}],rowCount:1},interests:{rows:[],rowCount:0,error:"HTTP_403"}},organicSearch:{status:"ready",timezone:"America/Los_Angeles",startDate:"2026-10-01",endDate:"2026-10-20",summary:{clicks:20,impressions:100,ctr:.2,position:3},rows:[{query:"donate zakat",pagePath:"/ar",clicks:20,impressions:100,ctr:.2,position:3}]}};
let trackingSettings={googleAdsConversionId:null,googleAdsConversionLabel:null};
let profileConflict=false;
const requests=[];let savedSupport=null;let failQuickResolve=false;let sends=0;let badgeName="Segment A";let gatewayScenario="paid";
const server=createServer(async(request,response)=>{const url=new URL(request.url,"http://fixture");response.setHeader("Cache-Control","no-store");
 const json=(body,status=200)=>{response.writeHead(status,{"content-type":"application/json"});response.end(JSON.stringify(body))};
 if(fonts[url.pathname]){response.writeHead(200,{"content-type":"font/woff2"});response.end(fonts[url.pathname]);return}
 if(url.pathname==="/bundle.js"){response.writeHead(200,{"content-type":"application/javascript"});response.end(bundle.outputFiles[0].contents);return}
 if(url.pathname==="/style.css"){response.writeHead(200,{"content-type":"text/css"});response.end(css+extraCss);return}
 let body={};if(request.method!=="GET"){let raw="";for await(const chunk of request)raw+=chunk;try{body=JSON.parse(raw)}catch{}}
 if(url.pathname.startsWith("/api/"))requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method,body});
 if(url.pathname==="/api/users")return json({users:[{id,name:"Fixture donor",email:"fixture@example.test",phone:"+15555555555",role:"DONOR",accountStatus:"MEMBER",countryCode:"TR",countryName:"Türkiye",preferredLang:"en",createdAt:"2026-10-26T00:00:00.000Z",updatedAt:"2026-10-26T00:00:00.000Z",badgeIds:[],totalDonationsCount:1,totalDonatedAmountUSD:100}],pagination:{total:1,pages:1}});
 if(url.pathname===`/api/dashboard/donors/${id}/profile`)return profileConflict?json({error:"PROFILE_CONFLICT"},409):json({ok:true});
 if(url.pathname==="/api/admin/subscriptions/overview/day-of-month/details")return json({rows:[{id,subscriptionId:id,status:"ACTIVE",frequency:"DAILY",amount:1,amountUSD:1,currency:"USD",createdAt:"2026-10-25T11:49:00Z",nextBillingDate:"2026-10-26T11:30:00Z",scheduledAt:url.searchParams.get("month")+"-"+url.searchParams.get("day").padStart(2,"0")+"T11:30:00Z",paidAt:"2026-10-25T11:49:00Z",donor:{id,name:"Calendar fixture",email:"calendar@example.test"},campaigns:[],categories:[],referral:null}],totals:{count:1,amountUSD:1}});
 if(url.pathname==="/api/admin/link-generator/data")return json({locales:["ar","en","tr"],currencies:["USD"],campaigns:[],categories:[],posts:[],postCategories:[]});
 if(url.pathname==="/api/referrals")return json([]);
 if(url.pathname==="/api/admin/marketing-intelligence/campaign-links")return json({ok:true,upserted:true});
 if(url.pathname==="/api/admin/bank-transfers/banks")return json({banks:[{id:"unknown",nameAr:"بنك بدون اسم",nameTr:null,nameEn:null,isActive:true,currency:"USD",displayOrder:0},{id:"named",nameAr:"Named bank",nameTr:null,nameEn:null,isActive:true,currency:"USD",displayOrder:1}],supportedCurrencies:["USD","TRY","EUR"]});
 if(url.pathname==="/api/admin/bank-transfers/transactions")return json({transactions:[],page:1,totalPages:1,total:0});
 if(url.pathname==="/api/certificates/copy")return json({overrides:{},defaults:{ar:{thanks:{title:"Fixture default"}}},updatedAt:"2026-10-25T01:00:00Z"});
 if(url.pathname==="/api/admin/content-localization/audit")return json({ok:true,section:"categories",targetLocales:["en"],generatedAt:"2026-10-25T01:00:00Z",summary:{totalItems:1,arabicQualityIssues:0,byLocale:{en:{incompleteItems:0,missingRecords:0,emptyFields:0,identicalToArabicFields:0}}},items:[]});
 if(url.pathname==="/api/global-settings")return json({mainGateway:"ALBARAKA",payforEnabled:true,albarakaConfigured:true,albarakaRecurringReady:true,albarakaUseOOS:false,allowAnyAmount:true});
 if(url.pathname==="/api/admin/google-analytics/report")return json({propertyId:"123456",range:url.searchParams.get("range"),period:Object.fromEntries(url.searchParams),report,updatedAt:"2026-10-25T01:00:00Z",cached:false});
 if(url.pathname==="/api/admin/google-analytics/analyze")return json({analysis:{summary:"Fixture evidence based analysis",opportunities:[{area:"seo",title:"Review landing page",finding:"Measured traffic",action:"Review page intent",evidenceIds:["e1"],confidence:"medium"}],limitations:["Top rows only"]},evidence:[{id:"e1",dataset:"pages",label:"/ar",metrics:{sessions:180}}],reportUpdatedAt:"2026-10-25T01:00:00Z"});
 if(url.pathname.startsWith("/api/admin/page-seo/")){if(request.method==="POST")return json({values:{metaTitle:"Research title",metaDescription:"Research description"},research:{summary:"Fixture research",sources:[{url:"https://example.org/source"}]}});return json({key:"home",revision:"1",defaults:{ar:{metaTitle:"Home",metaDescription:"Home description"}},overrides:{}})}
 if(url.pathname==="/api/admin/tracking"){if(request.method==="PUT")trackingSettings={...trackingSettings,...body};return json(trackingSettings)}
 if(url.pathname==="/api/admin/tracking/diagnostics")return json({ok:true,diagnostics:{}});
 if(url.pathname==="/api/admin/tracking/test")return json({ok:true,status:"ready",validationOnly:true,testEventSent:false,message:"Fixture saved settings checked"});
 if(url.pathname==="/api/admin/stats")return json({totalAmount:100,paidCount:4,failedCount:1,totalCampaigns:2,totalCategories:1,totalUsers:4,totalDonations:5,oneTimeCount:1,monthlyCount:3,activeMonthlyCount:1,monthlyRecurringRevenue:25,thisMonthRevenue:50,campaignDonationsTotal:100,categoryDonationsTotal:0,recentDonations:[]});
 if(url.pathname==="/api/admin/donations/chart")return json([{date:"2026-10-26",amountUSD:100,count:4,amountOneTime:25,countOneTime:1,amountMonthly:75,countMonthly:3,amountFailed:25,countFailed:1}]);
 if(url.pathname==="/api/admin/donations/countries")return json({countries:[{code:"TR",count:4}],unsetCount:0});
 if(url.pathname==="/api/admin/dashboard-summary")return json({today:{amountUSD:120,count:2,unpriced:0},month:{amountUSD:600,count:10,unpriced:0},support:{amountUSD:50,count:4,unpriced:0},failed:{amountUSD:150,count:3,unpriced:0},averageUSD:60,todayKey:"2026-10-26",monthKey:"2026-10"});
 if(url.pathname==="/api/admin/bank-transfers/summary")return json({totalUsd:0,totals:{},approvedCount:0,pendingCount:0});
 if(url.pathname==="/api/categories"||url.pathname==="/api/campaigns/all")return json([]);
 if(url.pathname==="/api/donations")return json({donations:["DAILY","FRIDAY","MONTHLY",null].map((frequency,index)=>({id:id.slice(0,-1)+index,locale:"en",provider:"ALBARAKA",securityMode:index===0?"2D":"3D",campaigns:[],categories:[],referral:null,donorCountryCode:"TR",amount:1,amountUSD:1,currency:"USD",teamSupport:0,fees:0,totalAmount:1,donor:{accountStatus:index===0?"MEMBER":index===1?"GUEST":"UNKNOWN",name:"Fixture "+(frequency||"ONCE"),email:"fixture@example.test",image:null},type:frequency?"MONTHLY":"ONE_TIME",frequency,status:"PAID",paidAt:"2026-10-25T11:49:24Z",paymentMethod:"CARD",createdAt:"2026-10-25T11:49:19Z",items:[]})),pagination:{pages:1,total:4}});
 if(/^\/api\/admin\/donations\/[^/]+\/gateway$/.test(url.pathname)&&gatewayScenario!=="paid"){
  const bank=gatewayScenario==="bank-failed";
  return json({id,provider:bank?"ALBARAKA":"PAYPAL",paymentMethod:bank?"CARD":"PAYPAL",status:bank?"FAILED":"PAID",amount:100,currency:"USD",totalAmount:100,amountUSD:100,paidAmount:null,paidCurrency:null,requestedGatewayAmount:bank?14931.09:100,requestedGatewayCurrency:bank?"TRY":"USD",paidAt:null,createdAt:"2026-10-26T01:00:00Z",billingReason:null,refs:{paypalOrderId:bank?null:"FIXTUREORDER001"},txn:{type:bank?"Sale":"Capture",result:bank?"Failed":"Success",returnCode:bank?"59":null,errorMessage:bank?"Fraud Şüphesi":null},paypalInspection:bank?null:{readOnly:true,checkedAt:"2026-10-26T05:00:00Z",outcome:gatewayScenario==="paypal-action"?"awaiting_buyer_action":gatewayScenario==="paypal-404"?"order_not_found":"capture_pending",orderStatus:gatewayScenario==="paypal-action"?"PAYER_ACTION_REQUIRED":gatewayScenario==="paypal-404"?null:"COMPLETED",captureStatus:gatewayScenario==="paypal-hold"?"PENDING":null,pendingReason:gatewayScenario==="paypal-hold"?"ECHECK":null},raw:[],rawTruncated:false});
 }
 if(/^\/api\/admin\/donations\/[^/]+\/gateway$/.test(url.pathname))return json({id,provider:"ALBARAKA",securityMode:"2D",paymentMethod:"CARD",status:"PAID",amount:1,currency:"USD",totalAmount:1,amountUSD:1,paidAmount:49.74,paidCurrency:"TRY",createdAt:"2026-10-25T11:49:19Z",paidAt:"2026-10-25T11:49:24Z",billingReason:"subscription_create",refs:{providerOrderId:"FIXTURE",providerAuthCode:"FIXTURE",providerHostRefNum:"FIXTURE"},txn:{type:"Sale",result:"Success",returnCode:"00",errorMessage:null},raw:[],rawTruncated:false});
 if(url.pathname===`/api/donations/${id}`){if(request.method==="PATCH"){savedSupport=body;return json({ok:true})}return json({id,amount:100,totalAmount:113,teamSupport:10,fees:3,coverFees:true,currency:"TRY",status:"PAID",paidAt:"2026-10-01T00:00:00Z",donor:{name:"Fixture donor"},items:[{campaignId:id,amount:100,campaign:{title:"Fixture project"}}],categoryItems:[],waqfItems:[]})}
 if(url.pathname==="/api/campaigns")return json({items:[{id,title:"Fixture project",isActive:true}],hasMore:false});if(url.pathname==="/api/categories")return json({items:[]});
 if(url.pathname==="/api/dashboard/communication/whatsapp/smart-send"){if(request.method==="POST"){sends++;return json({ok:true,result:{transport:"UTILITY_TEMPLATE_FALLBACK"}})}return json({ok:true,context:{userId:id,phone:"+905555555555",name:"Fixture donor",locale:"ar",doNotContact:false,whatsappUnsubscribed:false,consentCheckUnavailable:false,directSendEnabled:true,replyWindow:{open:false,remainingMs:0},utilityTemplates:[{id:"approved",name:"Approved receipt",category:"UTILITY"}],marketingTemplates:[],sender:null}})}
 if(url.pathname===`/api/dashboard/donors/${id}/communication`){if(url.searchParams.has("messageId"))return json({item:{channel:"EMAIL",renderedBody:'<p>Archived email content</p><img src="https://tracker.example/pixel"><script>throw new Error("must not run")</script>'}});const items=["WHATSAPP","EMAIL","SMS"].filter(channel=>!url.searchParams.get("channel")||channel===url.searchParams.get("channel")).map((channel,index)=>({id:id.slice(0,-1)+index,source:"delivery",channel,status:"DELIVERED",templateName:channel+" receipt",createdAt:"2026-10-25T01:00:00Z",deliveredAt:"2026-10-25T01:01:00Z"}));return json({donor:{name:"Fixture donor"},items,next:null})}
 if(url.pathname==="/api/admin/content-editor/categories")return json({items:[{id,title:"Fixture category",statuses:{en:{complete:true,seoComplete:false,reviewed:false,missing:[]}}}],nextCursor:null});
 if(url.pathname==="/api/admin/badges")return json({badges:[{id,name:badgeName,translatedName:"Wrong translated label",color:"#336699",criteria:{type:"TOTAL_LIFETIME",amountMinUSD:100},order:0}]});
 if(url.pathname===`/api/admin/badges/${id}`){if(request.method==="PUT"){badgeName=body.name;assert.equal(body.translations,undefined);return json({ok:true})}return json({id,name:badgeName,color:"#336699",criteria:{type:"TOTAL_LIFETIME",amountMinUSD:100},translations:[{locale:"en",name:"Old translation"}]})}
 if(url.pathname==="/api/quick-donation/resolve")return failQuickResolve?json({error:"UNAVAILABLE"},422):json({projectId:id});
 if(url.pathname.startsWith("/api/"))return json({error:"Unexpected fixture request"},404);
 response.writeHead(200,{"content-type":"text/html"});response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;let browser;const errors=[];let checks=0;
try{browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(const locale of ["ar","en","tr"]){const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on("pageerror",error=>{errors.push(error.message);console.error("fixture page error:",error.message)});page.setDefaultTimeout(20000);await page.context().addCookies([{name:"dash-locale",value:locale,url:origin}]);
 const open=async(surface)=>page.goto(`${origin}/?surface=${surface}&lang=${locale}`,{waitUntil:"domcontentloaded"});

 // Exercise the real row menu as well as the editor: overlapping modal lifecycles used
 // to leave body pointer-events disabled after the dialog closed in production.
 for(const [width,height,label] of [[1440,1000,"desktop"],[390,844,"mobile"]]){
   await page.setViewportSize({width,height});
   const openManagedProfile=async(keyboard=false)=>{
     await open("donorManagement");
     const actions=page.getByRole("button",{name:ui(locale,"الإجراءات"),exact:true});
     if(keyboard)await actions.press("Enter");else await actions.click();
     const edit=page.getByRole("menuitem",{name:ui(locale,"تعديل بيانات المتبرع"),exact:true});
     if(keyboard)await edit.press("Enter");else await edit.click();
     await page.getByRole("dialog").getByRole("heading",{name:ui(locale,"تعديل بيانات المتبرع"),exact:true}).waitFor();
     assert.equal(await page.getByRole("dialog").evaluate(node=>node.contains(document.activeElement)),true,"The profile must retain keyboard focus while open");
     assert.equal(await page.evaluate(()=>getComputedStyle(document.body).pointerEvents),"none","The open profile must still block background pointer input");
   };
   const verifyUnlockedNavigation=async()=>{
     await page.getByRole("dialog").waitFor({state:"detached"});
     await page.waitForFunction(()=>getComputedStyle(document.body).pointerEvents!=="none",undefined,{timeout:3000});
     await page.getByRole("link",{name:ui(locale,"محادثات واتساب"),exact:true}).click();
     await page.waitForURL(`${origin}/dashboard/communication/inbox`);
   };
   for(const close of ["cancel","close","escape"]){
     const writesBefore=requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").length;
     await openManagedProfile(close==="escape");
     if(close==="cancel")await page.getByRole("dialog").getByRole("button",{name:ui(locale,"إلغاء"),exact:true}).click();
     else if(close==="close")await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
     else await page.keyboard.press("Escape");
     await verifyUnlockedNavigation();
     assert.equal(requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").length,writesBefore,"Dismissing a profile must not save donor data");checks++;
   }
   await openManagedProfile();
   await page.getByRole("dialog").getByLabel(ui(locale,"الاسم"),{exact:true}).fill("Edited fixture through row menu");
   await page.getByRole("dialog").getByRole("button",{name:ui(locale,"حفظ"),exact:true}).click();
   await verifyUnlockedNavigation();
   assert.equal(requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").at(-1).body.name,"Edited fixture through row menu");checks++;
   await open("donorManagement");
   await page.getByRole("button",{name:ui(locale,"الإجراءات"),exact:true}).click();
   await page.getByRole("menuitem",{name:ui(locale,"تعديل الصلاحيات"),exact:true}).click();
   await page.getByRole("dialog").getByRole("heading",{name:ui(locale,"تعديل الدور والصلاحيات"),exact:true}).waitFor();
   await page.getByRole("dialog").getByRole("button",{name:ui(locale,"إلغاء"),exact:true}).click();
   await page.getByRole("dialog").waitFor({state:"detached"});
   await page.waitForFunction(()=>getComputedStyle(document.body).pointerEvents!=="none",undefined,{timeout:3000});
   await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-donor-menu-unlocked-${label}.png`),fullPage:true});
   await verifyUnlockedNavigation();checks++;
 }
 await page.setViewportSize({width:1440,height:1000});
 const initialProfileWrites=requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").length;
 // Real donor editor: validation, cancel, save and stale-write recovery at all viewport sizes.
 await open("donorProfile");
 await page.getByText(ui(locale,"عضو مسجل"),{exact:true}).waitFor();
 await page.getByRole("dialog").getByLabel(ui(locale,"الاسم"),{exact:true}).fill("Edited fixture");
 await page.getByRole("button",{name:ui(locale,"إلغاء"),exact:true}).click();
 assert.equal(requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").length,initialProfileWrites);checks++;
 await open("donorProfile");profileConflict=true;
 await page.getByRole("button",{name:ui(locale,"حفظ"),exact:true}).click();
 await page.getByRole("alert").getByText(ui(locale,"تغيرت البيانات. أغلق النافذة وحدّث القائمة ثم حاول مجددًا."),{exact:true}).waitFor();
 assert.equal(await page.getByRole("dialog").count(),1);checks++;
 profileConflict=false;await page.getByRole("dialog").getByLabel(ui(locale,"الاسم"),{exact:true}).fill("Edited fixture");
 await page.getByRole("button",{name:ui(locale,"حفظ"),exact:true}).click();await page.getByText("Closed",{exact:true}).waitFor();
 const profileWrite=requests.filter(row=>row.path.endsWith("/profile")&&row.method==="PUT").at(-1);
 assert.equal(profileWrite.body.name,"Edited fixture");assert.equal(profileWrite.body.updatedAt,"2026-10-26T00:00:00.000Z");assert.equal(profileWrite.body.role,undefined);checks++;
 for(const [width,height,label] of [[1440,1000,"desktop"],[390,844,"mobile"],[320,780,"narrow"]]){
   await page.setViewportSize({width,height});await open("donorProfile");await page.getByRole("dialog").waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   const saveBounds=await page.getByRole("button",{name:ui(locale,"حفظ"),exact:true}).boundingBox();
   assert.ok(saveBounds.y>=0&&saveBounds.y+saveBounds.height<=height,"Save must remain visible while the profile fields scroll");
   const titleBounds=await page.getByRole("dialog").getByRole("heading").evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().toJSON()});
   const closeBounds=await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).boundingBox();
   assert.ok(Math.min(titleBounds.x+titleBounds.width,closeBounds.x+closeBounds.width)-Math.max(titleBounds.x,closeBounds.x)<=1||Math.min(titleBounds.y+titleBounds.height,closeBounds.y+closeBounds.height)-Math.max(titleBounds.y,closeBounds.y)<=1,"The profile close control must not overlap its title in either text direction");
   await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-donor-profile-"+label+".png"),fullPage:true});checks++;
   const fields=page.getByRole("dialog").locator("form > div.overflow-y-auto");
   const fieldsBounds=await fields.boundingBox();
   assert.ok(fieldsBounds.y+fieldsBounds.height<saveBounds.y,"Scrolling profile fields must stay above the action buttons");
   const preferredLanguage=page.getByRole("dialog").getByLabel(ui(locale,"اللغة المفضلة"),{exact:true});
   await preferredLanguage.scrollIntoViewIfNeeded();
   const languageBounds=await preferredLanguage.boundingBox();
   assert.ok(languageBounds.y>=fieldsBounds.y&&languageBounds.y+languageBounds.height<=fieldsBounds.y+fieldsBounds.height+1,"The final profile field must be reachable without hiding the actions");
   assert.equal(await preferredLanguage.evaluate(node=>{const r=node.getBoundingClientRect();return node===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)}),true,"The final profile field must accept pointer input");
   await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-donor-profile-scrolled-"+label+".png"),fullPage:true});checks++;
   await open("topbar");const link=page.getByRole("link",{name:ui(locale,"واتساب، {0} محادثة تنتظر الرد").replace("{0}","27"),exact:true});await link.waitFor();
   assert.equal(await link.getAttribute("href"),"/dashboard/communication/inbox");const bounds=await link.boundingBox();assert.ok(bounds.width>=40&&bounds.height>=40);
   const overlaps=await page.locator("header button, header a").evaluateAll(nodes=>{
     const controls=nodes.map(node=>({rect:node.getBoundingClientRect(),label:node.getAttribute("aria-label")||node.textContent})).filter(item=>item.rect.width>0&&item.rect.height>0);
     const collisions=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
       const a=controls[i].rect,b=controls[j].rect;
       if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)collisions.push([controls[i].label,controls[j].label]);
     }return collisions;
   });
   assert.deepEqual(overlaps,[],"Header controls must never overlap");
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-whatsapp-button-"+label+".png"),fullPage:true});checks++;
 }
 await page.setViewportSize({width:1440,height:1000});
 // Actual inbox component: out-of-order responses, isolated drafts, retained history/scroll.
 const contacts=["A","B"].map((name,index)=>({id:"sender:+1555555000"+index,phone:"+1555555000"+index,donor:{name,userId:null},needsReply:true,unresolved:false,sender:{id:"sender",name:"Business",phone:"+15555559999"}}));
 let releaseFirst; let firstHeld=true; let state="SENT"; let failSend=false; let posts=0;
 const timeline=contact=>Array.from({length:35},(_,index)=>({id:contact+"-"+index,kind:index%2?"outbound":"inbound",text:contact+" message "+index,status:index%2?state:null,at:new Date(Date.UTC(2026,9,26,10,index)).toISOString()}));
 await page.route("**/api/dashboard/communication/inbox**",async route=>{
  const url=new URL(route.request().url());const contact=decodeURIComponent(url.pathname.split("/").at(-1));
  const finish=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(contact==="inbox")return finish({ok:true,conversations:contacts,senders:[],needsReply:2});
  const name=contact===contacts[0].id?"A":"B";
  if(route.request().method()==="POST"){posts++;return finish(failSend?{error:"PROVIDER_REJECTED"}:{ok:true,deliveryId:"reply"},failSend?502:200);}
  if(name==="A"&&firstHeld){firstHeld=false;await new Promise(resolve=>{releaseFirst=resolve;});}
  const older=url.searchParams.has("before");
  return finish({ok:true,conversation:{...contacts[name==="A"?0:1],timeline:older?[{id:name+"-older",kind:"inbound",text:name+" older history",status:null,at:"2026-10-25T00:00:00Z"}]:timeline(name),hasMore:!older,oldestAt:older?"2026-10-25T00:00:00Z":"2026-10-26T10:00:00Z"},replyWindow:{open:true,lastInboundAt:"2026-10-26T10:00:00Z",remainingMs:3600000}});
 });
 await open("inbox");await page.waitForFunction(()=>document.querySelectorAll("li button").length===2);for(let attempt=0;!releaseFirst&&attempt<200;attempt++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(releaseFirst,"initial detail request must be held");
 await page.locator("li button").filter({has:page.getByText("B",{exact:true})}).click();await page.getByText("B message 34",{exact:true}).waitFor();const staleResponse=page.waitForResponse(response=>decodeURIComponent(new URL(response.url()).pathname).endsWith(contacts[0].id));releaseFirst();await staleResponse;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.getByText("A message 34",{exact:true}).count(),0);assert.equal(await page.getByText("B message 34",{exact:true}).count(),1);
 await page.getByPlaceholder(ui(locale,"اكتب ردًّا…")).fill("Draft B");await page.locator("li button").filter({has:page.getByText("A",{exact:true})}).click();await page.getByText("A message 34",{exact:true}).waitFor();assert.equal(await page.locator("textarea").inputValue(),"");assert.equal(await page.getByText("B message 34",{exact:true}).count(),0);
 await page.locator("textarea").fill("Draft A");await page.locator("li button").filter({has:page.getByText("B",{exact:true})}).click();await page.getByText("B message 34",{exact:true}).waitFor();assert.equal(await page.locator("textarea").inputValue(),"Draft B");checks++;
 await page.getByRole("button",{name:ui(locale,"تحميل رسائل أقدم"),exact:true}).click();await page.getByText("B older history",{exact:true}).waitFor();
 const thread=page.locator("div.overflow-y-auto").filter({has:page.getByText("B message 34",{exact:true})});await thread.evaluate(node=>{node.scrollTop=10;node.dispatchEvent(new Event("scroll"));});state="READ";
 await page.getByRole("button",{name:ui(locale,"تحديث"),exact:true}).click();await page.getByText("B older history",{exact:true}).waitFor();await page.getByText(ui(locale,"قُرئت"),{exact:false}).first().waitFor();assert.ok(await thread.evaluate(node=>node.scrollTop)<80);assert.equal(await page.getByText("B message 34",{exact:true}).count(),1);checks++;
 failSend=true;await page.getByRole("button",{name:ui(locale,"إرسال"),exact:true}).click();await page.getByText("PROVIDER_REJECTED",{exact:false}).waitFor();assert.equal(await page.locator("textarea").inputValue(),"Draft B");assert.equal(posts,1);checks++;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-inbox-mobile.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-inbox-desktop.png"),fullPage:true});checks++;
 await page.unroute("**/api/dashboard/communication/inbox**");
 trackingSettings={googleAdsConversionId:null,googleAdsConversionLabel:null};
 await open("tracking");
 const adsCard=page.getByRole("region",{name:/Google Ads/});
 await adsCard.getByLabel("Conversion ID",{exact:true}).waitFor();
 await adsCard.getByLabel("Conversion ID",{exact:true}).fill("AW-123456789");
 await adsCard.getByLabel("Conversion Label",{exact:true}).fill("fixture_label");
 const readiness=adsCard.getByRole("button",{name:ui(locale,"فحص جاهزية الإعدادات"),exact:true});
 assert.equal(await readiness.isDisabled(),true,"unsaved pixel edits cannot test stale saved configuration");
 await page.getByRole("status").filter({hasText:ui(locale,"تعديلات غير محفوظة")}).waitFor();
 const beforeTracking=requests.filter(row=>row.path==="/api/admin/tracking"&&row.method==="PUT").length;
 page.once("dialog",dialog=>dialog.dismiss());
 await page.getByRole("button",{name:ui(locale,"حفظ الإعدادات"),exact:true}).first().click();
 assert.equal(requests.filter(row=>row.path==="/api/admin/tracking"&&row.method==="PUT").length,beforeTracking);
 assert.equal(await readiness.isDisabled(),true);
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:ui(locale,"حفظ الإعدادات"),exact:true}).first().click();
 await readiness.waitFor({state:"visible"});
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="region"]')).find(node=>node.getAttribute("aria-label")?.includes("Google Ads"))?.querySelector("button")?.disabled);
 await page.getByText(ui(locale,"مُعدّ"),{exact:true}).waitFor();
 await readiness.click();
 await page.getByText("Fixture saved settings checked",{exact:false}).first().waitFor();
 const trackingSaves=requests.filter(row=>row.path==="/api/admin/tracking"&&row.method==="PUT");
 assert.equal(trackingSaves.length,beforeTracking+1);
 assert.equal(trackingSaves.at(-1).body.googleAdsConversionId,"AW-123456789");
 assert.deepEqual(requests.filter(row=>row.path==="/api/admin/tracking/test").at(-1).body,{platform:"google_ads"});
 await page.setViewportSize({width:390,height:844});await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-tracking-readiness-mobile.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks+=3;
 await open("summary");
 await page.getByRole("heading",{name:ui(locale,"المؤشرات"),exact:true}).waitFor();
 const metricSection=page.getByRole("region",{name:ui(locale,"المؤشرات"),exact:true});
 await metricSection.getByText("$600",{exact:true}).waitFor();
 assert.equal(await metricSection.locator("div.rounded-xl").count(),6);
 await metricSection.getByText("$60",{exact:true}).waitFor();
 assert.equal(await page.getByText(ui(locale,"التبرعات الشهرية الناشطة"),{exact:true}).count(),0);
 assert.equal(await page.getByText(ui(locale,"إجمالي الإيرادات الناجحة"),{exact:true}).count(),0);checks++;

 await page.getByRole("cell",{name:"EN",exact:true}).first().waitFor();
 await page.getByRole("row").filter({hasText:"Fixture DAILY"}).getByRole("cell",{name:ui(locale,"ناجح")+" 2D",exact:true}).waitFor();
 await page.getByRole("row").filter({hasText:"Fixture DAILY"}).getByRole("button",{name:ui(locale,"عرض"),exact:true}).click();
 await page.getByRole("dialog").getByText(ui(locale,"عرض التفاصيل"),{exact:true}).waitFor();
 await page.getByRole("dialog").getByText("Fixture DAILY",{exact:true}).waitFor();
 await page.keyboard.press("Escape");checks++;
 const gateway=page.getByRole("combobox",{name:ui(locale,"بوابة الدفع"),exact:true});
 const providerReads=Promise.all(["/api/donations","/api/admin/stats","/api/admin/donations/chart"].map(endpoint=>page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===endpoint&&url.searchParams.get("provider")==="PAYPAL"})));
 await gateway.click();await page.getByRole("option",{name:"PayPal",exact:true}).click({noWaitAfter:true});
 await providerReads;
 for(const endpoint of ["/api/donations","/api/admin/stats","/api/admin/donations/chart"]) assert.ok(requests.some(row=>row.path===endpoint&&row.query.provider==="PAYPAL"),endpoint+" must retain provider filter");
 await page.getByRole("button",{name:ui(locale,"تصدير التقرير"),exact:true}).click();
 assert.equal(await page.getByRole("dialog").getByRole("combobox",{name:ui(locale,"بوابة الدفع"),exact:true}).textContent(),"PayPal");await page.keyboard.press("Escape");
 await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-revenue-dashboard-desktop.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"home controls must remain inside the mobile viewport");await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-revenue-dashboard-mobile.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 await open("calendar");
 const calendarCell=day=>page.getByRole("button",{name:ui(locale,"عرض تفاصيل اليوم {0} من الشهر").replace("{0}",String(day)),exact:true});
 await calendarCell(26).waitFor();assert.equal(await calendarCell(25).isEnabled(),false);assert.equal(await calendarCell(26).isEnabled(),true);checks++;
 await calendarCell(31).click();await page.getByRole("dialog").getByText("Calendar fixture",{exact:true}).waitFor();assert.equal(requests.at(-1).query.month,"2026-10");assert.equal(requests.at(-1).query.day,"31");await page.getByRole("dialog").getByText("Oct 31, 2026",{exact:true}).waitFor();await page.keyboard.press("Escape");checks++;
 await page.getByRole("button",{name:ui(locale,"المحصّل"),exact:true}).click();assert.equal(await calendarCell(25).isEnabled(),true);assert.equal(await calendarCell(26).isEnabled(),false);checks++;
 await page.getByRole("button",{name:ui(locale,"المتوقع"),exact:true}).click();await page.locator('input[type="month"]').fill("2026-11");await calendarCell(30).waitFor();assert.equal(await calendarCell(31).count(),0);assert.equal(await calendarCell(1).isEnabled(),true);checks++;
 await page.locator('input[type="month"]').fill("2028-02");await calendarCell(29).waitFor();assert.equal(await calendarCell(30).count(),0);checks++;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-recurring-calendar-mobile.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 await open("linksAudit");await page.getByRole("button",{name:ui(locale,"حفظ ونسخ الرابط"),exact:true}).waitFor();await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("fixture denied")}}}));await page.getByRole("button",{name:ui(locale,"حفظ ونسخ الرابط"),exact:true}).click();await page.getByText(ui(locale,"تم حفظ الرابط في سجل الحملات"),{exact:true}).waitFor();assert.equal((await page.locator("body").innerText()).includes(ui(locale,"· تم نسخه أيضًا").trim()),false);checks++;
 await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.fixtureCopied=value}}}));await page.getByRole("button",{name:ui(locale,"حفظ ونسخ الرابط"),exact:true}).click();await page.waitForFunction(()=>Boolean(window.fixtureCopied));await page.getByText(ui(locale,"· تم نسخه أيضًا").trim(),{exact:false}).waitFor();checks++;
 await open("bankAudit");await page.getByRole("combobox",{name:ui(locale,"البنك"),exact:true}).getByText("Named bank",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:ui(locale,"معاينة"),exact:true}).isEnabled(),false);checks++;
 await page.locator("summary").filter({hasText:ui(locale,"تصفية متقدمة")}).click();await page.getByLabel(ui(locale,"قيمة من"),{exact:true}).fill("5");assert.equal(await page.getByLabel(ui(locale,"قيمة من"),{exact:true}).getAttribute("type"),"number");await page.getByLabel(ui(locale,"من تاريخ"),{exact:true}).fill("2026-10-01");await page.locator("summary").filter({hasText:ui(locale,"تصفية متقدمة")}).click();checks++;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({animations:"disabled",path:path.join(artifacts,locale+"-bank-audit-mobile.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 await open("certificateAudit");try{await page.getByLabel(ui(locale,"عنوان الشهادة"),{exact:true}).fill("Fixture certificate");}catch(error){console.error("certificate fixture",locale,await page.locator("label,input,textarea").evaluateAll(nodes=>nodes.map(x=>({tag:x.tagName,text:x.tagName==="LABEL"?x.textContent:null,id:x.id,label:x.getAttribute("aria-label")}))));throw error;}assert.equal(await page.getByLabel(ui(locale,"نص الشهادة"),{exact:true}).count(),1);await page.getByRole("button",{name:ui(locale,"حفظ"),exact:true}).click();await page.getByRole("button",{name:ui(locale,"حفظ"),exact:true}).waitFor();assert.ok(requests.some(row=>row.path==="/api/certificates/copy"&&row.method==="PUT"&&JSON.stringify(row.body).includes("Fixture certificate")));checks++;
 await open("donations");
 for(const [name,label] of [["DAILY","يومي"],["FRIDAY","أسبوعياً"],["MONTHLY","شهري"],["ONCE","مرة واحدة"]]){const row=page.getByRole("row").filter({hasText:"Fixture "+name});await row.getByRole("cell",{name:ui(locale,label),exact:true}).waitFor();checks++;}
 await page.getByRole("row").filter({hasText:"Fixture DAILY"}).getByRole("button",{name:ui(locale,"إجراءات"),exact:true}).click();
 await page.getByRole("menuitem",{name:ui(locale,"عرض"),exact:true}).click();
 await page.getByRole("dialog").getByText("00",{exact:true}).waitFor();
 assert.equal(await page.locator("#fixture-nav").textContent(),"");checks++;
 for(const [scenario,message] of [
  ["paypal-action","بانتظار استكمال المتبرع لخطوات PayPal؛ لا يوجد تحصيل مؤكد."],
  ["paypal-404","لم يعثر PayPal على الطلب. قد يتعلق الأمر بصلاحية الطلب أو مرجعه أو صلاحيات الوصول؛ لا تثبت هذه النتيجة حصول خصم أو فشل الدفع."],
  ["paypal-hold","التحصيل معلّق لدى PayPal. راجع سبب الانتظار وحساب التاجر."],
  ["bank-failed","Fraud Şüphesi"],
 ]){
  gatewayScenario=scenario;const start=requests.length;await open("donations");
  await page.getByRole("row").filter({hasText:"Fixture DAILY"}).getByRole("button",{name:ui(locale,"إجراءات"),exact:true}).click();
  await page.getByRole("menuitem",{name:ui(locale,"عرض"),exact:true}).click();
  const dialog=page.getByRole("dialog");await dialog.getByText(ui(locale,message),{exact:scenario!=="bank-failed"}).waitFor();
  await dialog.getByText(ui(locale,"المبلغ المطلوب من البوابة"),{exact:true}).waitFor();
  assert.equal(await dialog.getByText(ui(locale,"المبلغ المسجل عند تأكيد الدفع"),{exact:true}).count(),0);
  assert.equal(await dialog.getByText(ui(locale,"تمت العملية"),{exact:true}).count(),0);
  assert.ok(requests.slice(start).every(row=>row.method==="GET"));
  if(scenario==="paypal-hold")await dialog.getByText("ECHECK",{exact:true}).waitFor();
  await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-${scenario}-desktop.png`),fullPage:true});checks++;
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-${scenario}-mobile.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 }
 gatewayScenario="paid";
 await open("gateways");await page.getByRole("heading",{name:ui(locale,"التكرار"),exact:true}).waitFor();await page.getByText(ui(locale,"يومي")+" / "+ui(locale,"كل جمعة"),{exact:true}).waitFor();assert.equal(await page.getByText(ui(locale,"شهري"),{exact:true}).count(),1);assert.equal(await page.getByText(ui(locale,"التبرعات الشهرية تمرّ دائمًا عبر Stripe لأنها تحتاج إلى تحصيل متكرر لا توفّره بوابتا 3D Secure. كما يبقى Stripe هو المسار الاحتياطي عند فشل أي عملية 3D Secure."),{exact:true}).count(),0);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const payforHeading=await page.getByRole("heading",{name:/PayFor/}).boundingBox();const payforSwitch=await page.getByRole("switch").last().boundingBox();assert.ok(payforHeading&&payforSwitch&&(Math.min(payforHeading.x+payforHeading.width,payforSwitch.x+payforSwitch.width)<=Math.max(payforHeading.x,payforSwitch.x)||Math.min(payforHeading.y+payforHeading.height,payforSwitch.y+payforSwitch.height)<=Math.max(payforHeading.y,payforSwitch.y)),"gateway switch must not cover its heading on mobile");await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-recurring-readiness-mobile.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 await open("campaigns");const campaignLink=page.getByRole("link",{name:"Fixture campaign with a readable name",exact:true});await campaignLink.waitFor();assert.ok((await campaignLink.boundingBox()).width>=180,"campaign name must remain readable beside numeric columns");await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-campaigns.png`),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"wide campaign columns must scroll inside the table");assert.ok((await campaignLink.boundingBox()).width>=180);await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-campaigns-mobile.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});checks++;
 await open("amounts");const teamInput=page.getByRole("textbox",{name:"Team support amounts",exact:true});const projectInput=page.getByRole("textbox",{name:"Project amounts",exact:true});await projectInput.waitFor();assert.notEqual(await teamInput.getAttribute("id"),await projectInput.getAttribute("id"));await page.getByText("Project amounts",{exact:true}).click();assert.equal(await projectInput.evaluate(element=>element===document.activeElement),true,"each repeated editor label must focus its own input");checks++;
 await open("donation");await page.locator("#donation-team-support").waitFor();await page.locator("#donation-team-support").fill("-1");assert.equal(await page.getByRole("button",{name:ui(locale,"حفظ التعديلات"),exact:true}).isEnabled(),false);await page.locator("#donation-team-support").fill("25");await page.getByRole("button",{name:ui(locale,"حفظ التعديلات"),exact:true}).click();await page.getByPlaceholder("128").fill("128");await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-donation-support.png`),fullPage:true});await page.getByRole("button",{name:ui(locale,"نعم، طبّق التعديل"),exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});assert.equal(savedSupport.teamSupport,25);assert.equal(savedSupport.items,undefined);checks++;
 await open("smart");await page.getByRole("combobox").selectOption("approved");assert.equal(await page.getByRole("button",{name:ui(locale,"إرسال"),exact:true}).isEnabled(),true);await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-approved-template.png`),fullPage:true});await page.getByRole("link",{name:ui(locale,"سجل المحادثة"),exact:true}).click();await page.getByRole("heading",{name:ui(locale,"سجل تواصل المتبرع"),exact:true}).waitFor();assert.equal(await page.getByRole("dialog").count(),0);checks++;
 await open("smart");await page.getByRole("combobox").selectOption("approved");const count=sends;await page.getByRole("button",{name:ui(locale,"إرسال"),exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});assert.equal(sends,count+1);checks++;
 await open("badges");await page.getByText(badgeName,{exact:true}).waitFor();assert.equal(await page.getByRole("tab").first().getAttribute("aria-selected"),"true");assert.equal(await page.getByText("Wrong translated label",{exact:true}).count(),0);await page.getByRole("button",{name:ui(locale,"تعديل"),exact:true}).click();await page.getByRole("dialog").waitFor();assert.equal(await page.locator("#badge-translation-locale").count(),0);await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-segment.png`),fullPage:true});checks++;
 await open("analytics");await page.getByRole("heading",{name:ui(locale,"صفحات الدخول وفرص SEO"),exact:true}).waitFor();await page.locator("#ga4-range").selectOption("custom");await page.getByLabel(ui(locale,"من تاريخ"),{exact:true}).fill("2026-10-01");await page.getByLabel(ui(locale,"إلى تاريخ"),{exact:true}).fill("2026-10-20");await page.getByRole("button",{name:ui(locale,"تطبيق الفترة"),exact:true}).click();await page.getByText("2026-10-01 — 2026-10-20",{exact:false}).first().waitFor();await page.getByRole("button",{name:ui(locale,"تحليل هذه الفترة"),exact:true}).click();await page.getByText("Fixture evidence based analysis",{exact:true}).waitFor();await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-analytics.png`),fullPage:true});checks++;
 await page.getByRole("link",{name:ui(locale,"مراجعة SEO بهذه البيانات"),exact:true}).first().click();await page.getByRole("heading",{name:ui(locale,"SEO الصفحات العامة"),exact:true}).waitFor();await page.getByLabel(ui(locale,"استخدام بيانات GA4 في اقتراح SEO"),{exact:true}).waitFor();assert.equal(await page.getByLabel(ui(locale,"استخدام بيانات GA4 في اقتراح SEO"),{exact:true}).isChecked(),true);await page.getByRole("button",{name:ui(locale,"اقتراح SEO للغة الحالية"),exact:true}).click();await page.getByText("Fixture research",{exact:true}).waitFor();const seoRequest=requests.filter(row=>row.path.startsWith("/api/admin/page-seo/")&&row.method==="POST").at(-1);assert.equal(seoRequest.body.analyticsPeriod.startDate,"2026-10-01");checks++;
 await open("history");await page.getByRole("heading",{name:ui(locale,"سجل تواصل المتبرع"),exact:true}).waitFor();await page.getByLabel(ui(locale,"القناة"),{exact:true}).selectOption("EMAIL");await page.getByText("EMAIL · EMAIL receipt",{exact:true}).waitFor();await page.getByText(ui(locale,"عرض محتوى الرسالة"),{exact:true}).click();await page.locator("iframe").waitFor();await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-history.png`),fullPage:true});checks++;
 await page.setViewportSize({width:390,height:844});await open("analytics");await page.getByRole("heading",{name:ui(locale,"صفحات الدخول وفرص SEO"),exact:true}).waitFor();await page.screenshot({animations:"disabled",path:path.join(artifacts,`${locale}-analytics-mobile.png`),fullPage:true});const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("body *")].filter(node=>node.getBoundingClientRect().right>innerWidth+1||node.getBoundingClientRect().left< -1).slice(0,12).map(node=>({tag:node.tagName,class:node.className,width:node.getBoundingClientRect().width}))}));assert.ok(viewport.scroll<=viewport.width+1,JSON.stringify(viewport));checks++;
 const initialOverviewRequests=requests.filter(row=>row.path==="/api/admin/content-editor/categories").length;const initialQualityRequests=requests.filter(row=>row.path==="/api/admin/content-localization/audit").length;await open("overview");await page.locator("details > summary").first().waitFor();assert.equal(requests.filter(row=>row.path==="/api/admin/content-editor/categories").length,initialOverviewRequests);await page.locator("details > summary").first().click();await page.locator("details details > summary").click();await page.getByText("Fixture category",{exact:true}).waitFor();assert.equal(requests.filter(row=>row.path==="/api/admin/content-localization/audit").length,initialQualityRequests);await page.getByRole("button",{name:ui(locale,"فتح اللوحة"),exact:true}).click();await page.getByRole("button",{name:ui(locale,"تحديث الفحص"),exact:true}).waitFor();assert.equal(requests.filter(row=>row.path==="/api/admin/content-localization/audit").length,initialQualityRequests+1);assert.equal(requests.filter(row=>row.path==="/api/admin/content-editor/categories").length,initialOverviewRequests+1);await page.locator("details > summary").first().click();await page.locator("details > summary").first().click();assert.equal(requests.filter(row=>row.path==="/api/admin/content-editor/categories").length,initialOverviewRequests+1);checks++;
 await page.close();}
 const quickPage=await browser.newPage({viewport:{width:1440,height:1000}});quickPage.on("pageerror",error=>errors.push(error.message));
 await quickPage.goto(`${origin}/?surface=quick&unmapped=1&lang=ar`);await quickPage.locator("#qb-destination").waitFor();assert.equal(await quickPage.getByRole("button",{name:"donateNow",exact:true}).isEnabled(),false);await quickPage.locator("#qb-destination").click();await quickPage.getByRole("option",{name:"Fixture project",exact:true}).click();await quickPage.getByRole("button",{name:"donateNow",exact:true}).click();await quickPage.locator("#fixture-nav").getByText("/ar/cart",{exact:true}).waitFor();assert.equal(requests.filter(row=>row.path==="/api/quick-donation/resolve").at(-1).body.destination,id);checks++;
 await quickPage.goto(`${origin}/?surface=quick&lang=ar`);await quickPage.getByRole("button",{name:"donateNow",exact:true}).click();await quickPage.locator("#fixture-nav").getByText("/ar/cart",{exact:true}).waitFor();assert.equal(requests.filter(row=>row.path==="/api/quick-donation/resolve").at(-1).body.destination,"where-needed");assert.equal(await quickPage.evaluate(id=>Object.values(localStorage).some(value=>value.includes(id)),id),true);checks++;
 failQuickResolve=true;await quickPage.goto(`${origin}/?surface=quick&lang=ar`);await quickPage.getByRole("button",{name:"donateNow",exact:true}).click();await quickPage.getByText("quickDestinationUnavailable",{exact:true}).waitFor();assert.equal(await quickPage.locator("#fixture-nav").textContent(),"");await quickPage.setViewportSize({width:390,height:844});await quickPage.screenshot({animations:"disabled",path:path.join(artifacts,"quick-destination-unavailable-mobile.png"),fullPage:true});checks++;await quickPage.close();
 assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,"verification.json"),JSON.stringify({checks,locales:["ar","en","tr"],externalMessages:0,productionWrites:0},null,2));console.log(`dashboard followup browser: ${checks} checks passed`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
