import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
const require = createRequire(import.meta.url);
import assert from "node:assert/strict";

// Real React checkout, card preview, phone input, cart and order driver.
// Auth/settings are fixtures; HTTP and the final bank navigation never reach a provider.
const entry = `import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {NextIntlClientProvider} from "next-intl";
import DonationDialog from "./components/DonationDialog";
import CheckoutPage from "./components/minbar/checkout/CheckoutPage";
import {PayForCardForm} from "./components/PayForCardForm";
import {submitGatewayForm} from "./lib/minbar/checkout";
window.fixtureResult=submitGatewayForm;
import {writeCart} from "./lib/minbar/cart";
import ar from "./i18n/messages/ar.json";import en from "./i18n/messages/en.json";import tr from "./i18n/messages/tr.json";
const lang=new URLSearchParams(location.search).get("lang")||"en";
document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";
writeCart([{projectId:"fixture-project",typeKey:"project",freqKey:new URLSearchParams(location.search).get("frequency")||"once",amount:25,currency:new URLSearchParams(location.search).get("currency")||"USD",schedule:{hour:9,minute:30,dayOfMonth:1}}]);
function Legacy(){const [card,setCard]=useState({cardNumber:"",expiryDate:"",cvv:"",cardholderName:""});const [focus,setFocus]=useState("");return <div id="legacy"><PayForCardForm cardDetails={card} setCardDetails={setCard} cardFocus={focus} setCardFocus={setFocus}/></div>}
createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale={lang} timeZone="UTC" messages={{ar,en,tr}[lang]}>{new URLSearchParams(location.search).has("dialog")?<DonationDialog isOpen guestMode oneTimeOnly onClose={()=>{}} campaignId="600000000000000000000001" campaignTitle="Fixture project" initialDonationAmount={25}/>:<><CheckoutPage projects={[{id:"600000000000000000000001",slug:"fixture-project",title:"Fixture project"}]} categories={[]} banks={[]} donor={null} defaultCountry={new URLSearchParams(location.search).has("saudi")?"sa":"tr"}/><Legacy/></>}</NextIntlClientProvider>);`;
const mocks = {
  "@/components/SignInDialog": 'export function SignInPanel(){return null}',
  "@/hooks/useIpCountry": 'export function useIpCountry(){return "tr"}',
  "@/hooks/useCampaignValue": 'export function getCurrency(){return "USD"}',
  "@/components/TrackingPixels": 'export function useTracking(){return null}',
  "@/context/CurrencyContext": 'export function useCurrency(){return {exchangeRates:{USD:1,TRY:35},convertToCurrency(value){return {convertedValue:value}},convertToUSD(value){return value},getSelectedCurrency(){return "USD"}}}',
  "@/i18n/routing": 'export function useRouter(){return {push(){},replace(){}}}',

  "next/link": 'import React from "react";export default function Link({children,...p}){return <a {...p}>{children}</a>}',
  "next/navigation": 'export function useParams(){return {locale:new URLSearchParams(location.search).get("lang")||"en"}} export function useRouter(){return {push(url){document.getElementById("navigation").textContent=url}}}',
  "next-auth/react": 'export function useSession(){return {data:new URLSearchParams(location.search).has("signed")?{user:{id:"fixture-user"}}:null}} export function signIn(){}',
  "@/hooks/useQuietFloatingButtons": 'export function useQuietFloatingButtons(){}',
  "@/hooks/useMinbarMoney": 'export function useMinbarMoney(){return {currency:new URLSearchParams(location.search).get("currency")||"USD"}}',
  "@/hooks/useDonationAmount": 'export function useDonationAmount(){return {lineTooSmall:()=>false,minLabel:"$1",lineValue:row=>row.amount,inLocal:false}} export function useHealLegacyRows(){}',
  "@/hooks/useReferralCode": 'export function useReferralCode(){return ()=>null}',
  "@/lib/global-settings-client": 'export async function fetchGlobalSettings(){return {mainGateway:"ALBARAKA",payforSaudiRoutingEnabled:new URLSearchParams(location.search).has("saudi"),payforEnabled:new URLSearchParams(location.search).has("payfor"),albarakaUseOOS:new URLSearchParams(location.search).has("oos"),albarakaConfigured:true,albarakaRecurringReady:true,teamSupportEnabled:false}} export function getCachedGlobalSettings(){return {mainGateway:"ALBARAKA",payforSaudiRoutingEnabled:new URLSearchParams(location.search).has("saudi"),payforEnabled:new URLSearchParams(location.search).has("payfor"),albarakaUseOOS:new URLSearchParams(location.search).has("oos"),albarakaConfigured:true,albarakaRecurringReady:true,teamSupportEnabled:false}}',
  "@/lib/stripe-client": 'export function getStripePromise(){return null}',
  "@stripe/react-stripe-js": 'export function Elements({children}){return children}',
  "@/components/StripePaymentStep": 'import React from "react";export const StripePaymentStep=React.forwardRef(function Step(){return null})',
  "@/lib/ai/concierge/client": 'export function readConciergeAssisted(){return null}export function readConciergeTouched(){return null}',
  "@/lib/attribution/client-payload": 'export function getDonationAttributionPayload(){return {}}',
};
const bundle = await build({stdin:{contents:entry,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,outfile:"checkout-fixture.js",platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"',"process.env":"{}"},plugins:[{name:"checkout-fixture-boundaries",setup(builder){
  builder.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:"fixture"}:null);
  builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"tsx",resolveDir:process.cwd()}));
}}]});
const js = bundle.outputFiles.find(file=>file.path.endsWith(".js")) || bundle.outputFiles[0];
const css = bundle.outputFiles.find(file=>file.path.endsWith(".css"));
const layout = (await postcss([tailwindcss({...require("../tailwind.config.ts").default,content:["components/minbar/checkout/*.tsx","components/DonationDialog.tsx","components/PayForCardForm.tsx","components/ui/*.tsx"]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined})).css + await readFile("styles/minbar/minbar.css","utf8");
const server = createServer((req,res)=>{
  if(req.url==="/bundle.js"){res.setHeader("content-type","text/javascript");res.end(js.text);}
  else if(req.url==="/bundle.css"){res.setHeader("content-type","text/css");res.end((css?.text||"")+layout);}
  else {res.setHeader("content-type","text/html; charset=utf-8");res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><body class="mia-scope"><div id="root"></div><p id="navigation"></p><script src="/bundle.js"></script>');}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const out=path.resolve(process.env.CONTENT_EDITOR_ARTIFACTS||".artifacts/content-editor","checkout-readiness");
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
const errors=[], requests=[];
let checks=0;
try {
 for(const lang of ["ar","en","tr"]){
  for(const width of [390,1440]){
   console.log("Checking checkout",lang,width);
   const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);
   page.on("pageerror",err=>{errors.push(err.message);console.error(err.message)});
   await page.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin) return route.abort();
    if(url.pathname.startsWith("/api/")){
     requests.push({path:url.pathname,body:req.postDataJSON()});
     if(url.pathname==="/api/cart/payment") return route.fulfill({json:{donation:{id:"600000000000000000000002",accessToken:"a".repeat(48)}}});
     if(url.pathname==="/api/albaraka/3d/initiate") return route.fulfill({json:{actionUrl:"https://bank.invalid/authorize",fields:{fixture:"signed-fields"}}});
     throw new Error("Unexpected API: "+url.pathname);
    }
    return route.continue();
   });
   await page.addInitScript(()=>{window.fixtureSubmissions=[];HTMLFormElement.prototype.submit=function(){window.fixtureSubmissions.push({action:this.action,method:this.method,target:this.target,mask:this.getAttribute("data-clarity-mask"),fields:Object.fromEntries(new FormData(this))})}});
   await page.goto(origin+"/?lang="+lang,{waitUntil:"domcontentloaded"});
   
   await page.locator("#checkout-cardNumber").waitFor();
   const submit=page.locator(".pay-form button[type=submit]");
   const before=requests.length;
   assert.equal(await page.locator('#albaraka-3d').isChecked(),false,"3D is an optional checkbox");
   assert.equal(await page.locator('#albaraka-3d').getAttribute('type'),'checkbox');
   assert.equal(await submit.isDisabled(),false,"missing fields remain actionable so validation can explain them");
   assert.equal(requests.length,before);
   const mode=width===390?"2D":"3D";
   if(mode==="3D") await page.locator('#albaraka-3d').check();
   assert.equal(requests.length,before,"choosing a mode must not create an order or contact a bank");
   assert.equal(await page.locator('.ab-verification-option').count(),1);
   checks++;

   const checkField=async field=>{
    await submit.click();
    await page.locator("#checkout-"+field+'[aria-invalid="true"]').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),"checkout-"+field);
    assert.ok(await page.locator("#checkout-"+field+"-error").textContent());
    assert.equal(requests.length,before);checks++;
   };
   await checkField("firstName");await page.locator("#checkout-firstName").fill("Fixture donor");
   await page.locator("#checkout-email").fill("invalid@");await checkField("email");
   await page.locator("#checkout-email").fill("fixture@example.invalid");await checkField("phone");
   await page.locator("#checkout-phone").fill("+90");await page.locator("#checkout-phone").press("End");await page.locator("#checkout-phone").pressSequentially("5551234567");await page.locator("#checkout-phone").blur();await checkField("cardNumber");
   await page.locator("#checkout-cardNumber").fill("4111111111111111");await checkField("cardExpiry");
   await page.locator("#checkout-cardExpiry").fill("1239");await checkField("cardCvc");
   await page.locator("#checkout-cardCvc").fill("123");
   assert.equal(await page.locator("#checkout-cardCvc").getAttribute("type"),"password");
   assert.equal((await page.locator(".pay-card-preview").textContent()).includes("123"),false);
   assert.ok(await page.locator(".pay-card-preview").evaluate(node=>node.closest('[data-clarity-mask="True"]')!==null));
   assert.equal(await page.locator("#card-fields [autocomplete^=cc-]").evaluateAll(nodes=>nodes.every(node=>node.closest('[data-clarity-mask="True"]'))),true);
   assert.equal(await page.locator("#legacy .rccs").evaluate(node=>!!node.closest('[data-clarity-mask="True"]')),true);checks++;
   await page.locator('#legacy [autocomplete="cc-number"]').fill("٤"+"١".repeat(18));
   assert.equal((await page.locator('#legacy [autocomplete="cc-number"]').inputValue()).replace(/\s/g,""),"4"+"1".repeat(18));
   await page.locator('#legacy [autocomplete="cc-csc"]').fill("١٢٣");
   assert.equal(await page.locator('#legacy [autocomplete="cc-csc"]').inputValue(),"123");
   assert.equal(await page.locator('#legacy [autocomplete="cc-csc"]').getAttribute("type"),"password");
   assert.equal((await page.locator("#legacy .rccs__cvc").textContent()).includes("123"),false);checks++;
   await page.screenshot({path:path.join(out,`${lang}-${width}.png`),fullPage:true,animations:"disabled"});
   await submit.click();await page.waitForFunction(()=>window.fixtureSubmissions.length===1);
   const handoff=await page.evaluate(()=>window.fixtureSubmissions[0]);
   assert.equal(handoff.action,"https://bank.invalid/authorize");assert.equal(handoff.method,"post");assert.equal(handoff.mask,"True");
   assert.deepEqual(handoff.fields,{fixture:"signed-fields"});
   const order=requests.slice(before).find(row=>row.path==="/api/cart/payment");
   assert.equal(requests.slice(before).find(row=>row.path==="/api/albaraka/3d/initiate").body.securityMode,mode);
   assert.equal(order.body.items[0].campaignId,"600000000000000000000001");assert.equal(order.body.items[0].amount,25);assert.equal(order.body.currency,"USD");
   assert.equal(await page.evaluate(()=>sessionStorage.getItem("mia_guest_donation_access_v1")?.includes("a".repeat(48))||Object.values(sessionStorage).some(value=>value.includes("a".repeat(48)))),true);checks++;
   const translations=JSON.parse(await readFile("i18n/messages/"+lang+".json","utf8")).DonationDialog;
   await page.goto(origin+"/?dialog=1&lang="+lang,{waitUntil:"domcontentloaded"});
   for(let step=0;step<4;step++){
    if(await page.locator('[data-donation-field="firstName"]').count())break;
    await page.getByRole("button",{name:translations.next,exact:true}).click();
    await page.waitForTimeout(250);
   }
   await page.locator('[data-donation-field="firstName"]').waitFor();
   const popupSubmit=page.getByRole("button",{name:translations.confirmDonation,exact:true});
   const popupBefore=requests.length;
   const checkPopup=async field=>{await popupSubmit.click();await page.locator('[data-donation-field="'+field+'"][aria-invalid="true"]').waitFor();await page.waitForFunction(expected=>document.activeElement?.getAttribute("data-donation-field")===expected,field);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("data-donation-field")),field);assert.ok(await page.getByRole("alert").textContent());assert.equal(requests.length,popupBefore);checks++;};
   await checkPopup("firstName");await page.locator('[data-donation-field="firstName"]').fill("Fixture");
   await checkPopup("lastName");await page.locator('[data-donation-field="lastName"]').fill("Donor");
   await checkPopup("email");await page.locator('[data-donation-field="email"]').fill("fixture@example.invalid");
   await checkPopup("phone");await page.locator('[data-donation-field="phone"]').fill("+90");await page.locator('[data-donation-field="phone"]').press("End");await page.locator('[data-donation-field="phone"]').pressSequentially("5551234567");
   await checkPopup("cardNumber");await page.locator('[data-donation-field="cardNumber"]').fill("4111111111111111");
   await checkPopup("cardholderName");await page.locator('[data-donation-field="cardholderName"]').fill("Fixture Donor");
   await checkPopup("expiryDate");await page.locator('[data-donation-field="expiryDate"]').fill("1230");
   await checkPopup("cvv");
   await page.screenshot({path:path.join(out,`popup-${lang}-${width}-required-field.png`),fullPage:true});
   await page.close();
  }
 }
 // Imported signed-in accounts must still correct required contact data.
 const page=await browser.newPage();await page.route("https://**/*",route=>route.abort());await page.goto(origin+"/?lang=en&signed=1");await page.locator("#checkout-cardNumber").waitFor();
 await page.locator("#albaraka-3d").uncheck();await page.locator(".pay-form button[type=submit]").click();await page.locator('#checkout-email[aria-invalid="true"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),"checkout-email");checks++;await page.close();
 for(const frequency of ["daily","monthly","friday"]){
  const page=await browser.newPage();await page.route("https://**/*",route=>route.abort());await page.goto(origin+"/?lang=ar&frequency="+frequency);await page.locator("#checkout-cardNumber").waitFor();
  assert.equal(await page.locator('input[name="albaraka-verification"]').count(),1,"recurring checkout explains its fixed 2D route");assert.equal(await page.locator("#albaraka-2d").isChecked(),true);assert.equal(await page.locator("#albaraka-2d").isDisabled(),true);checks++;await page.close();
 }
 // TRY keeps PayFor 3D; switching an OOS-enabled Albaraka checkout to 2D must collect the card locally.
 for (const query of ["lang=tr&currency=TRY&payfor=1", "lang=tr&oos=1"]) {
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.route("https://**/*",route=>route.abort());await page.goto(origin+"/?"+query);
  if(query.includes("payfor")) {
   await page.locator("#checkout-cardNumber").waitFor();assert.equal(await page.locator("#albaraka-3d").isChecked(),true);assert.equal(await page.locator("#albaraka-3d").isDisabled(),true);assert.equal(await page.locator("#albaraka-2d").count(),0);
  } else {
   await page.locator("#albaraka-3d").waitFor();assert.equal(await page.locator("#albaraka-3d").isChecked(),false);await page.locator("#checkout-cardNumber").waitFor();await page.locator("#albaraka-3d").check();assert.equal(await page.locator("#checkout-cardNumber").count(),0);await page.locator("#albaraka-3d").uncheck();await page.locator("#checkout-cardNumber").waitFor();
  }
  checks++;await page.close();
 }
 const resultPage=await browser.newPage();await resultPage.route("https://**/*",route=>route.abort());await resultPage.goto(origin+"/?lang=tr");
 const resultPath="/api/albaraka/2d/result?donationId=fixture&locale=tr&t=fixture-token";
 await resultPage.route("**/api/albaraka/2d/result?**",route=>route.fulfill({contentType:"text/html",body:"Fixture result"}));
 await resultPage.evaluate(path=>window.fixtureResult({actionUrl:location.origin+path,method:"GET",fields:{}},{Pan:"4111111111111111"}),resultPath);
 await resultPage.waitForURL(origin+resultPath);assert.equal(new URL(resultPage.url()).searchParams.get("t"),"fixture-token");checks++;await resultPage.close();

 // Automatic signed-in card storage is best effort and never blocks a payment.
 for (const vaultWorks of [true, false]) {
  console.log("Checking automatic card storage",vaultWorks);
  const page=await browser.newPage({viewport:{width:390,height:900}}), calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",async route=>{
   const req=route.request(), url=new URL(req.url()); if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith("/api/"))return route.continue();
   calls.push({path:url.pathname,method:req.method(),body:req.postDataJSON()});
   if(url.pathname==="/api/credit-cards")return route.fulfill(req.method()==="GET"?{json:{cards:[]}}:vaultWorks?{json:{card:{id:"fixture-saved-card"}}}:{status:503,json:{error:"fixture wallet unavailable"}});
   if(url.pathname==="/api/users/me/phone")return route.fulfill({json:{ok:true}});
   if(url.pathname==="/api/cart/payment")return route.fulfill({json:{donation:{id:"600000000000000000000002",accessToken:"a".repeat(48)}}});
   if(url.pathname==="/api/albaraka/3d/initiate")return route.fulfill({json:{actionUrl:"https://bank.invalid/authorize",fields:{fixture:"signed-fields"}}});
   throw new Error("Unexpected API "+url.pathname);
  });
  await page.addInitScript(()=>{window.fixtureSubmissions=[];HTMLFormElement.prototype.submit=function(){window.fixtureSubmissions.push({action:this.action,fields:Object.fromEntries(new FormData(this))})}});
  await page.goto(origin+"/?lang=en&signed=1");await page.locator("#checkout-cardNumber").waitFor();
  await page.locator("#albaraka-3d").uncheck();await page.locator("#checkout-email").fill("fixture@example.invalid");
  await page.locator("#checkout-phone").fill("+90");await page.locator("#checkout-phone").press("End");await page.locator("#checkout-phone").pressSequentially("5551234567");await page.locator("#checkout-phone").blur();
  await page.locator("#checkout-cardNumber").fill("4111111111111111");await page.locator("#checkout-cardExpiry").fill("1239");await page.locator("#checkout-cardCvc").fill("123");await page.locator('#card-fields input[autocomplete="cc-name"]').fill("Fixture Donor");
  assert.equal(await page.locator('input[type="checkbox"]').count(),1,"only the optional 3D checkbox is present");
  await page.locator(".pay-form button[type=submit]").click();await page.waitForFunction(()=>window.fixtureSubmissions.length===1);
  assert.equal(calls.filter(r=>r.path==="/api/credit-cards"&&r.method==="POST").length,1);
  assert.equal(calls.filter(r=>r.path==="/api/cart/payment").length,1);
  const bank=calls.find(r=>r.path==="/api/albaraka/3d/initiate");assert.equal(bank.body.savedCardId,vaultWorks?"fixture-saved-card":undefined);
  checks++;await page.close();
 }
 for (const correction of [false,true]) {
  console.log("Checking Saudi payment preview/correction",correction);
  const page=await browser.newPage({viewport:{width:390,height:900}}), calls=[];let orderAttempts=0;
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith("/api/"))return route.continue();
   const body=req.postDataJSON();calls.push({path:url.pathname,body});
   if(url.pathname==="/api/payments/route")return route.fulfill({json:{gateway:correction?"ALBARAKA":"PAYFOR",quote:{amountTRY:1250,originalAmount:25,originalCurrency:"USD"}}});
   if(url.pathname==="/api/cart/payment") { orderAttempts++;if(correction&&orderAttempts===1)return route.fulfill({status:409,json:{code:"PAYMENT_ROUTING_CHANGED",gateway:"PAYFOR",error:"Route updated"}});return route.fulfill({json:{donation:{id:"600000000000000000000002",accessToken:"a".repeat(48)}}}); }
   if(url.pathname==="/api/payfor/3dpay/initiate")return route.fulfill({json:{actionUrl:"https://bank.invalid/payfor",fields:{Currency:"949",SecureType:"3DPay",PurchAmount:"1250.00"}}});
   throw new Error("Unexpected Saudi API "+url.pathname);
  });
  await page.addInitScript(()=>{window.fixtureSubmissions=[];HTMLFormElement.prototype.submit=function(){window.fixtureSubmissions.push({action:this.action,fields:Object.fromEntries(new FormData(this))})}});
  await page.goto(origin+"/?lang=en&saudi=1&payfor=1");await page.locator("#checkout-cardNumber").waitFor();
  await page.locator("#checkout-firstName").fill("Fixture Donor");await page.locator("#checkout-email").fill("fixture@example.invalid");
  await page.locator("#checkout-phone").fill("+966");await page.locator("#checkout-phone").press("End");await page.locator("#checkout-phone").pressSequentially("501234567");await page.locator("#checkout-phone").blur();
  if(correction)await page.locator("#albaraka-3d").uncheck();else await page.waitForFunction(()=>document.querySelector("#albaraka-3d")?.matches(":disabled"));
  await page.locator("#checkout-cardNumber").fill("4111111111111111");await page.locator("#checkout-cardExpiry").fill("1239");await page.locator("#checkout-cardCvc").fill("123");await page.locator('#card-fields input[autocomplete="cc-name"]').fill("Fixture Donor");
  await page.locator(".pay-form button[type=submit]").click();
  if(correction){await page.waitForFunction(()=>document.querySelector("#albaraka-3d")?.matches(":disabled"));assert.equal(orderAttempts,1);assert.equal(await page.evaluate(()=>window.fixtureSubmissions.length),0);await page.locator("#checkout-cardCvc").fill("123");await page.locator(".pay-form button[type=submit]").click();}
  await page.waitForFunction(()=>window.fixtureSubmissions.length===1);
  const order=calls.filter(r=>r.path==="/api/cart/payment").at(-1);assert.equal(order.body.expectedGateway,"PAYFOR");assert.equal(order.body.routingPhone,"+966501234567");assert.equal(order.body.currency,"USD");
  const bank=await page.evaluate(()=>window.fixtureSubmissions[0]);assert.equal(bank.fields.Currency,"949");assert.equal(bank.fields.SecureType,"3DPay");assert.equal(bank.fields.PurchAmount,"1250.00");
  checks++;await page.close();
 }
 for(const lang of ["ar","en","tr"])for(const width of [390,1440])for(const frequency of ["daily","friday","monthly"]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:"Europe/Istanbul"});let orders=0;
  page.on("pageerror",e=>errors.push(e.message));await page.clock.setFixedTime(new Date("2026-10-31T12:00:00Z"));
  await page.route("**/*",async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith("/api/")){if(url.pathname==="/api/cart/payment")orders++;return route.fulfill({json:{gateway:"ALBARAKA",ok:true}});}return route.continue();});
  await page.goto(origin+`/?lang=${lang}&frequency=${frequency}`);const terms=page.locator(".pay-recurring-terms");await terms.waitFor();
  const dates={daily:"2026-11-01T06:30:00Z",friday:"2026-11-06T06:30:00Z",monthly:"2026-12-01T06:30:00Z"};
  const expected=new Intl.DateTimeFormat(lang,{dateStyle:"full",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(new Date(dates[frequency]));
  assert.ok((await terms.textContent()).includes(expected));assert.equal(await terms.locator("span").count(),3);
  assert.equal(orders,0);assert.equal(await page.locator("#albaraka-2d").isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`${lang}-${width}-${frequency}-terms.png`),fullPage:true});checks+=5;await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,"verification.json"),JSON.stringify({checks,locales:["ar","en","tr"],widths:[390,1440],pageErrors:errors,scope:"Real client components with synthetic HTTP/auth/settings and intercepted gateway navigation. No payment, production database, analytics upload or message."},null,2));
 console.log(`Checkout readiness browser checks: ${checks} passed.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
