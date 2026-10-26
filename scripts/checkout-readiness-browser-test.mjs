import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Real React checkout, card preview, phone input, cart and order driver.
// Auth/settings are fixtures; HTTP and the final bank navigation never reach a provider.
const entry = `import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {NextIntlClientProvider} from "next-intl";
import CheckoutPage from "./components/minbar/checkout/CheckoutPage";
import {PayForCardForm} from "./components/PayForCardForm";
import {writeCart} from "./lib/minbar/cart";
import ar from "./i18n/messages/ar.json";import en from "./i18n/messages/en.json";import tr from "./i18n/messages/tr.json";
const lang=new URLSearchParams(location.search).get("lang")||"en";
document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";
writeCart([{projectId:"fixture-project",typeKey:"project",freqKey:new URLSearchParams(location.search).get("frequency")||"once",amount:25,currency:"USD"}]);
function Legacy(){const [card,setCard]=useState({cardNumber:"",expiryDate:"",cvv:"",cardholderName:""});const [focus,setFocus]=useState("");return <div id="legacy"><PayForCardForm cardDetails={card} setCardDetails={setCard} cardFocus={focus} setCardFocus={setFocus}/></div>}
createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale={lang} timeZone="UTC" messages={{ar,en,tr}[lang]}><CheckoutPage projects={[{id:"600000000000000000000001",slug:"fixture-project",title:"Fixture project"}]} categories={[]} banks={[]} donor={null} defaultCountry="tr"/><Legacy/></NextIntlClientProvider>);`;
const mocks = {
  "next/link": 'import React from "react";export default function Link({children,...p}){return <a {...p}>{children}</a>}',
  "next/navigation": 'export function useParams(){return {locale:new URLSearchParams(location.search).get("lang")||"en"}} export function useRouter(){return {push(url){document.getElementById("navigation").textContent=url}}}',
  "next-auth/react": 'export function useSession(){return {data:new URLSearchParams(location.search).has("signed")?{user:{id:"fixture-user"}}:null}} export function signIn(){}',
  "@/hooks/useQuietFloatingButtons": 'export function useQuietFloatingButtons(){}',
  "@/hooks/useMinbarMoney": 'export function useMinbarMoney(){return {currency:"USD"}}',
  "@/hooks/useDonationAmount": 'export function useDonationAmount(){return {lineTooSmall:()=>false,minLabel:"$1"}} export function useHealLegacyRows(){}',
  "@/hooks/useReferralCode": 'export function useReferralCode(){return ()=>null}',
  "@/lib/global-settings-client": 'export async function fetchGlobalSettings(){return {mainGateway:"ALBARAKA",payforEnabled:false,albarakaUseOOS:false,albarakaConfigured:true,albarakaRecurringReady:true,teamSupportEnabled:true}}',
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
const layout = await readFile("styles/minbar/minbar.css","utf8");
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
   assert.equal(await page.locator('input[name="albaraka-verification"]:checked').count(),0);
   assert.equal(await submit.isDisabled(),true);
   assert.equal(requests.length,before);
   const mode=width===390?"2D":"3D";
   await page.locator('#albaraka-'+mode.toLowerCase()).check();
   assert.equal(requests.length,before,"choosing a mode must not create an order or contact a bank");
   const boxes=await page.locator('.ab-verification-option').evaluateAll(nodes=>nodes.map(node=>({x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y,width:node.getBoundingClientRect().width})));
   assert.equal(boxes.length,2);assert.equal(boxes[0].y,boxes[1].y,"options must remain side by side");
   if(lang==="ar") assert.ok(boxes[0].x>boxes[1].x,"2D comes first on the right in RTL");
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
   assert.equal((await page.locator(".pay-card-preview .rccs__cvc").textContent()).includes("123"),false);
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
   await page.close();
  }
 }
 // Imported signed-in accounts must still correct required contact data.
 const page=await browser.newPage();await page.route("https://**/*",route=>route.abort());await page.goto(origin+"/?lang=en&signed=1");await page.locator("#checkout-cardNumber").waitFor();
 await page.locator("#albaraka-2d").check();await page.locator(".pay-form button[type=submit]").click();await page.locator('#checkout-email[aria-invalid="true"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),"checkout-email");checks++;await page.close();
 for(const frequency of ["daily","monthly","friday"]){
  const page=await browser.newPage();await page.route("https://**/*",route=>route.abort());await page.goto(origin+"/?lang=ar&frequency="+frequency);await page.locator("#checkout-cardNumber").waitFor();
  assert.equal(await page.locator('input[name="albaraka-verification"]').count(),0,"recurring checkout must hide 2D/3D options");checks++;await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,"verification.json"),JSON.stringify({checks,locales:["ar","en","tr"],widths:[390,1440],pageErrors:errors,scope:"Real client components with synthetic HTTP/auth/settings and intercepted gateway navigation. No payment, production database, analytics upload or message."},null,2));
 console.log(`Checkout readiness browser checks: ${checks} passed.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
