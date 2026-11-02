import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as policy from "../../lib/events/payment-receipt-policy";
import * as cadence from "../../lib/templates/recurring-cadence";
import * as money from "../../lib/templates/donation-money";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { fixtureModule } from "./gift-delivery-fixture";
// Synthetic provider and DB boundaries; actual dispatch and receipt policy run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
function fixture(values:{locale?:string;frequency?:"DAILY"|"FRIDAY"|"MONTHLY";first?:boolean;oneTime?:boolean;settled?:boolean;status?:string;fallback?:string;outcome?:string;reason?:string;claimUnavailable?:boolean}={}){
 const locale=values.locale??"ar",frequency=values.frequency??"DAILY",sent:Row[]=[],claims=new Map<string,Row>(),siteEvents:string[]=[];let documents=0,conversions=0,gifts=0;
 const canonical=values.oneTime?"DONATION_PAID":values.first?"SUBSCRIPTION_CREATED":"SUBSCRIPTION_PAYMENT";
 const ctx:Row={user:{id:"donor",name:"Fixture",phone:"+15555555555",email:"fixture@example.invalid",preferredLang:locale,countryCode:"TR"},donations:[],totals:{},donation:{id:"donation",locale,settled:values.settled!==false,subscriptionId:values.oneTime?undefined:"plan",billingReason:values.first?"subscription_create":"subscription_cycle",providerTxnType:values.first?"Sale":"RecurringSale",...money.donationMoneyFields({amount:1,totalAmount:1,currency:"USD",paidAt:new Date(),billingReason:values.first?"subscription_create":"subscription_cycle",frequency},locale)},subscription:values.oneTime?undefined:{id:"plan",status:values.status??"ACTIVE",frequency,frequencyLabel:cadence.recurringFrequencyLabel(frequency,locale),amount:"1",currency:"USD",nextBillingDate:"2026-11-06"}};
 const triggers:Row[]=[];for(const channel of ["EMAIL","WHATSAPP","SMS"])for(const event of policy.PAYMENT_RECEIPT_EVENTS)triggers.push({id:event+channel,event,channel,templateId:event+channel});
 triggers.push({...triggers.find(t=>t.event===canonical&&t.channel==="SMS")!,id:"zz-duplicate",templateId:"duplicate"});
 const template=(id:string)=>values.fallback&&id.startsWith(canonical)?null:{id,name:id,body:"{{donation.receiptSummary}}",subject:"Receipt",document:{},translations:Object.fromEntries(SUPPORTED_LOCALES.map(code=>[code,{body:"{{donation.receiptSummary}}",subject:"Receipt",document:{}}]))};
 const capture=async(input:Row)=>{sent.push(input);return input.templateId.startsWith(canonical)&&values.outcome?{outcome:values.outcome,reason:values.reason}:{outcome:"SENT"};};
 const prisma={messageTrigger:{findMany:async({where}:Row)=>triggers.filter(t=>typeof where.event==="string"?t.event===where.event:where.event.in.includes(t.event))},emailTemplate:{findUnique:async({where}:Row)=>template(where.id)},smsTemplate:{findUnique:async({where}:Row)=>template(where.id)},whatsappTemplate:{findUnique:async({where}:Row)=>template(where.id)},donation:{findUnique:async()=>({donorId:"donor",amount:1,currency:"USD",subscriptionId:values.oneTime?null:"plan"}),count:async()=>2},$runCommandRaw:async(query:Row)=>{
  if(values.claimUnavailable)throw new Error("Fixture DB unavailable");
  if(query.find)return{cursor:{firstBatch:[...claims.values()].filter(row=>query.filter._id.$in.includes(row._id)).slice(0,1)}};
  if(query.insert){const row=query.documents[0];if(claims.has(row._id))return{writeErrors:[{code:11000}]};claims.set(row._id,{...row});return{n:1};}
  if(query.findAndModify){const row=claims.get(query.query._id);if(!row||row.token!==query.query.token)return{value:null};Object.assign(row,query.update.$set);return{value:row};}throw new Error("Unexpected claim command");
 }};
 const dependencies:Row=Object.fromEntries([...readFileSync("lib/events/dispatch.ts","utf8").matchAll(/from\s+["']([^"']+)["']/g)].map(match=>[match[1],{}]));
 Object.assign(dependencies,{
  "./payment-receipt-policy":policy,"@/lib/prisma":{prisma},"@/lib/templates/variables":{loadContextForDonation:async()=>ctx,mergeText:(body:string)=>body.replace("{{donation.receiptSummary}}",ctx.donation.receiptSummary)},"@/lib/templates/recurring-cadence":cadence,"@/lib/templates/donation-money":money,
  "@/lib/templates/font":{automaticEmailHtml:(html:string)=>html},"@/lib/templates/render":{renderEmailHtml:async()=>ctx.donation.receiptSummary,renderEmailSubject:(subject:string)=>subject},"@/lib/templates/localize-donation-failure-link":{localizeDonationFailureLinks:(html:string)=>html},
  "@/lib/templates/locale-resolver":{pickLocale:()=>locale,resolveEmailVariant:(tpl:Row)=>({document:tpl.document,subject:tpl.subject,resolvedLocale:locale}),resolveWhatsappBody:(tpl:Row)=>({body:tpl.body,resolvedLocale:locale})},
  "@/lib/audit-log":{writeAuditLog:async()=>{}},"@/lib/dashboard/audit-log-display":{triggerEventLabelAr:(event:string)=>event},"@/lib/telegram/notify":{notifyDonationEvent:async(event:string)=>{siteEvents.push(event);}},
  "@/lib/communication/automatic-message-dispatcher":{sendAutomaticEmailMessage:capture,sendAutomaticWhatsappMessage:capture,sendAutomaticSmsMessage:capture,resolveMetaTemplateMapping:async()=>({positionalNames:[],componentsSchema:[]})},
  "@/lib/communication/sender-resolution":{loadSenderRoutingSnapshot:async()=>({}),resolveSenderFromSnapshot:()=>({ok:true,sender:{id:"sender",senderEmail:"sender@example.invalid",phoneNumberId:"phone",businessAccountId:"waba"}})},
  "@/lib/certificates/issue":{ensureDonationDocuments:async()=>{documents++;return{locale,thanks:{}};}},"@/lib/certificates/generate":{donationAttachments:async()=>[]},"@/lib/server-base-url":{getServerBaseUrl:()=>"https://fixture.invalid"},
  "@/lib/tracking/donation-conversion-server":{sendDonationServerConversions:async()=>{conversions++;return{ok:true};}},"@/lib/communication/donor-communication-profile-service":{upsertProfileForUser:async()=>{}},"@vercel/analytics/server":{track:async()=>{}},"@/lib/donations/gift-delivery":{deliverDonationGifts:async()=>{gifts++;}},
 });
 const dispatch=fixtureModule<{dispatchDonationPaid:(id:string)=>Promise<void>;dispatchEvent:(event:string,input:Row)=>Promise<unknown>}>("lib/events/dispatch.ts",dependencies);
 return{dispatch,ctx,sent,claims,siteEvents,counts:()=>({documents,conversions,gifts}),canonical};
}
for(const locale of SUPPORTED_LOCALES)for(const frequency of ["DAILY","FRIDAY","MONTHLY"] as const)test(`${locale}/${frequency}: concurrent generic and recurring callbacks deliver one receipt per channel`,async()=>{
 const f=fixture({locale,frequency});await Promise.all([f.dispatch.dispatchDonationPaid("donation"),f.dispatch.dispatchEvent("SUBSCRIPTION_PAYMENT",{donationId:"donation"})]);
 assert.equal(f.sent.length,3);assert.ok(f.sent.every(row=>row.triggerEvent==="SUBSCRIPTION_PAYMENT"));assert.equal(f.claims.size,1);assert.equal(f.claims.get("PAYMENT_RECEIPT:donation")?.state,"COMPLETED");assert.ok(f.siteEvents.includes("DONATION_PAID"));assert.equal(f.counts().conversions,1);assert.equal(f.counts().gifts,1);assert.ok(f.counts().documents>0);
 await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,3);assert.ok(f.sent.every(row=>String(row.renderedBody).includes(cadence.recurringFrequencyLabel(frequency,locale))));
});
test("first recurring payment uses signup receipt, and one-time gift uses generic receipt",async()=>{
 for(const values of [{first:true},{oneTime:true}]){const f=fixture(values);await Promise.all([f.dispatch.dispatchDonationPaid("donation"),f.dispatch.dispatchEvent("SUBSCRIPTION_CREATED",{donationId:"donation"})]);assert.equal(f.sent.length,3);assert.ok(f.sent.every(row=>row.triggerEvent===f.canonical));}
});
test("missing recurring template falls back once per channel without a second confirmation",async()=>{
 const f=fixture({fallback:"missing"});await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,3);assert.ok(f.sent.every(row=>row.templateId.startsWith("DONATION_PAID")));
});
for(const [outcome,reason] of [["FAILED","OUTCOME_UNKNOWN"],["SKIPPED","RECIPIENT_UNSUBSCRIBED"],["SKIPPED","DUPLICATE_REQUEST"]])test(`${outcome}/${reason}: no generic fallback after uncertain delivery, opt-out or deduplication`,async()=>{
 const f=fixture({outcome,reason});await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,3);assert.ok(f.sent.every(row=>row.templateId.startsWith(f.canonical)));
});
test("unconfirmed payment never sends a success receipt or consumes a claim",async()=>{
 const f=fixture({settled:false});await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,0);assert.equal(f.claims.size,0);
});
test("legacy receipt claims prevent replay across the new shared receipt key",async()=>{
 for(const state of [undefined,"COMPLETED","IN_PROGRESS"]){const f=fixture();f.claims.set("DONATION_PAID:donation",{_id:"DONATION_PAID:donation",state});await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,0);}
});
test("a late first payment on a cancelled plan uses a receipt without claiming activation",()=>{
 assert.equal(policy.paymentReceiptEvent({subscription:{status:"CANCELLED"}}),"DONATION_PAID");assert.equal(policy.paymentReceiptEvent({subscription:{status:"PAYMENT_FAILED"}}),"DONATION_PAID");assert.equal(policy.paymentReceiptEvent({subscription:{status:"ACTIVE"}}),"SUBSCRIPTION_CREATED");
});

test("receipt claim database failure defers delivery rather than sending a possible duplicate",async()=>{
 const f=fixture({claimUnavailable:true});await f.dispatch.dispatchDonationPaid("donation");assert.equal(f.sent.length,0);assert.equal(f.claims.size,0);
});
