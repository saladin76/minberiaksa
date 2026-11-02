import test from "node:test";
import assert from "node:assert/strict";
import { donationFinancialSummary } from "../../lib/dashboard/donation-financial-summary";
import { subscriptionPaymentSequence } from "../../lib/dashboard/subscription-payment-sequence";
import type { BankDonation, BankOperation } from "../../lib/donations/bank-operations-core";
import { inheritRecurringAttribution } from "../../lib/donations/recurring-attribution";
import { detectDonationSource } from "../../lib/attribution/detect-source";
import { computeOverview, type AggregateDonationInput } from "../../lib/attribution/aggregate";
import { resolveAttribution } from "../../lib/tracking/attribution-resolver";
import { cartHasMixedCadences } from "../../lib/donations/recurring-schedule";
import { createDonation, OrderRejectedError, type CreateDonationInput } from "../../lib/minbar/checkout";

function sale(): BankDonation { return { id:"a".repeat(24),provider:"ALBARAKA",providerOrderId:"B".repeat(24),providerHostRefNum:"private-bank-reference",providerTxnType:"Sale",providerRaw:{albarakaRequest:{orderId:"B".repeat(24),amount:"10000",currencyCode:"US",mode:"2D"}},status:"PAID",paidAt:new Date(),bankOperations:[] }; }
function adjustment(amountMinor:number,state:BankOperation["state"]="SUCCEEDED"):BankOperation {return {id:"private-operation",key:"private-key",action:"REFUND",state,amountMinor,currency:"USD",createdAt:"2026-11-01",updatedAt:"2026-11-01",actorId:"private-staff",actorName:"private-name",reason:"private refund reason"};}

test("multiple partial and external refunds produce the exact balance without leaking the ledger",()=>{
  const row=sale();row.bankOperations=[adjustment(1500),adjustment(1000),adjustment(900,"DECLINED")];
  row.bankLastInquiry={orderId:row.providerOrderId,currency:"USD",amountMinor:10000,externalReturnedMinor:500};
  const summary=donationFinancialSummary(row);
  assert.deepEqual(summary,{state:"PARTIALLY_REFUNDED",returnedMinor:3000,remainingMinor:7000,currency:"USD"});
  assert.doesNotMatch(JSON.stringify(summary),/private|actor|reason|reference|key|operation/i);
});
test("full refund, void and uncertain adjustment are distinct from a successful unadjusted sale",()=>{
  const row=sale();assert.equal(donationFinancialSummary(row)?.state,"PAID");
  row.bankOperations=[adjustment(10000)];assert.equal(donationFinancialSummary(row)?.state,"REFUNDED");
  row.bankOperations=[{...adjustment(10000),action:"VOID"}];assert.equal(donationFinancialSummary(row)?.state,"VOIDED");
  row.bankOperations=[adjustment(1000,"UNKNOWN")];assert.equal(donationFinancialSummary(row)?.state,"REVIEW_REQUIRED");
  row.bankOperations=[adjustment(11000)];assert.equal(donationFinancialSummary(row)?.state,"REVIEW_REQUIRED");
});
test("an unrelated bank inquiry cannot change another sale's refund status",()=>{
  const row=sale();row.bankLastInquiry={orderId:"different",currency:"USD",amountMinor:10000,externalReturnedMinor:10000};
  assert.equal(donationFinancialSummary(row)?.state,"PAID");
  row.paidAt=null;assert.equal(donationFinancialSummary(row),null);
});
test("failed attempts and test cycles do not advance real renewal ordinals",()=>{
  const make=(id:string,index:number,status="PAID",billingReason:string|null=null)=>({id,subscriptionId:"plan",status,paidAt:status==="FAILED"?null:new Date(index*1000),createdAt:new Date(index*1000),billingReason,providerTxnType:null});
  const rows=[make("failed-signup",0,"FAILED"),make("signup",1),make("test-one",2,"PAID","subscription_test_cycle"),make("test-two",3,"PAID","subscription_test_cycle"),make("failed-renewal",4,"FAILED","subscription_cycle"),make("renewal-one",5,"PAID","subscription_cycle"),{...make("pending-renewal",6,"PAID","subscription_cycle"),paidAt:null},make("renewal-two",7,"PAID","subscription_cycle")];
  const map=subscriptionPaymentSequence([...rows].reverse());
  assert.equal(map.get("signup")?.isRecurringCharge,false);
  assert.equal(map.get("test-one")?.testCycle,1);assert.equal(map.get("test-two")?.testCycle,2);
  assert.equal(map.get("failed-renewal")?.renewalNumber,1);assert.equal(map.get("renewal-one")?.renewalNumber,1);
  assert.equal(map.get("pending-renewal")?.renewalNumber,2);assert.equal(map.get("renewal-two")?.renewalNumber,2);
});
test("an explicit signup marker remains authoritative over a legacy provider type",()=>{
  const date=new Date();const map=subscriptionPaymentSequence([{id:"signup",subscriptionId:"plan",status:"PAID",paidAt:date,createdAt:date,billingReason:"subscription_create",providerTxnType:"RecurringSale"}]);
  assert.equal(map.get("signup")?.isRecurringCharge,false);assert.equal(map.get("signup")?.renewalNumber,null);
});

const sourceInput=(attribution:Record<string,unknown>|null)=>({attribution,status:"PAID",conversionEventsSentAt:new Date(),conversionFailedEventsSentAt:null});
test("missing source data is unknown in both resolvers rather than proven non-ad or direct traffic",()=>{
  assert.equal(detectDonationSource(sourceInput(null)).status,"unknown");
  assert.equal(resolveAttribution(sourceInput({})).status,"unknown");
  assert.equal(resolveAttribution(sourceInput({source_capture:"direct"})).status,"direct");
});
for(const [field,platform] of [["gbraid","google"],["wbraid","google"],["twclid","x"],["scclid","snapchat"],["li_fat_id","linkedin"],["rdt_cid","reddit"]])test(`${field} survives platform detection in both resolvers`,()=>{
  const input=sourceInput({[field]:"native-click"});assert.equal(detectDonationSource(input).platform,platform);assert.equal(resolveAttribution(input).platform,platform);
});
test("campaign/channel details are preserved even when the source is not an advertising platform",()=>{
  const result=detectDonationSource(sourceInput({utm_source:"whatsapp",utm_medium:"message",utm_campaign:"Gaza November",ad_group_name:"Returning donors"}));
  assert.equal(result.sourceLabel,"whatsapp");assert.equal(result.campaignName,"Gaza November");assert.ok(result.sourceDetails.some(row=>row.value==="Returning donors"));
});
test("a Facebook click alone does not certify paid advertising; conflicting platforms cannot be verified",()=>{
  const facebook=sourceInput({fbclid:"click",fbp:"cookie",fbc:"cookie"});
  assert.notEqual(detectDonationSource(facebook).status,"verified");assert.notEqual(resolveAttribution(facebook).status,"verified");
  const conflict=sourceInput({utm_source:"google_ads",utm_medium:"cpc",fbclid:"click"});
  assert.equal(detectDonationSource(conflict).status,"tracking-error");assert.equal(resolveAttribution(conflict).status,"tracking_issue");
});
test("source inheritance preserves signup acquisition and never fabricates a fresh click or browser identity",async()=>{
  const selected:unknown[]=[];
  const database={donation:{findFirst:async(args:unknown)=>{selected.push(args);return {attribution:{utm_source:"facebook",utm_medium:"paid_social",campaign_name:"Gaza",ad_id:"123",client_ip:"private-ip",user_agent:"private-browser",fbclid:"old-click",fbc:"old-cookie",ga_client_id:"private-client"}};}}} as unknown as Parameters<typeof inheritRecurringAttribution>[0];
  const inherited=await inheritRecurringAttribution(database,"subscription","owner");
  assert.deepEqual(inherited,{utm_source:"facebook",utm_medium:"paid_social",campaign_name:"Gaza",ad_id:"123",platform:"meta",acquisition_kind:"paid",attribution_origin:"subscription_signup"});
  assert.doesNotMatch(JSON.stringify(inherited),/private|old-click|old-cookie/);
  assert.match(JSON.stringify(selected),/"subscriptionId":"subscription","donorId":"owner"/);
});
test("optional acquisition lookup failure cannot block a legitimate renewal",async()=>{
  const database={donation:{findFirst:async()=>{throw Error("unavailable");}}} as unknown as Parameters<typeof inheritRecurringAttribution>[0];
  assert.deepEqual(await inheritRecurringAttribution(database,"plan","owner"),{attribution_origin:"subscription_signup",source_capture:"unavailable"});
});
test("a click-only signup preserves its historical platform without copying the click identifier",async()=>{
  const database={donation:{findFirst:async()=>({attribution:{gclid:"original-native-click"}})}} as unknown as Parameters<typeof inheritRecurringAttribution>[0];
  const inherited=await inheritRecurringAttribution(database,"plan","owner") as Record<string,unknown>;
  assert.deepEqual(inherited,{platform:"google_ads",acquisition_kind:"paid",attribution_origin:"subscription_signup"});
  const resolved=resolveAttribution(sourceInput(inherited));assert.equal(resolved.platform,"google");assert.equal(resolved.paidEvidence,true);assert.notEqual(resolved.status,"verified");
});
test("mixed cadence carts are rejected before any order or payment request",async()=>{
  assert.equal(cartHasMixedCadences([{freqKey:"daily"},{freqKey:"monthly"}]),true);
  assert.equal(cartHasMixedCadences([{freqKey:"once"},{freqKey:"monthly"}]),true);
  assert.equal(cartHasMixedCadences([{freqKey:"friday"},{freqKey:"friday"}]),false);
  const input: CreateDonationInput={items:[{freqKey:"daily",amount:1,currency:"USD"},{freqKey:"monthly",amount:1,currency:"USD"}],projects:[],currency:"USD",locale:"ar",method:"CARD",teamSupport:0,teamSupportRecurring:true,guest:null};
  await assert.rejects(createDonation(input),error=>error instanceof OrderRejectedError&&error.code==="MIXED_DONATION_FREQUENCIES");
});

test("unknown and ambiguous acquisition revenue is neither advertising nor proven non-ad, and total paid revenue stays intact",()=>{
  const make=(id:string,amount:number,attribution:Record<string,unknown>|null):AggregateDonationInput=>({id,status:"PAID",createdAt:new Date(),paidAt:new Date(),amountUSD:amount,amount,totalAmount:amount,currency:"USD",attribution,conversionEventsSentAt:new Date(),conversionFailedEventsSentAt:null,donorId:id,donorCountryCode:null,isFirstEverDonation:true});
  const result=computeOverview([make("paid",20,{utm_source:"google_ads",gclid:"native"}),make("direct",5,{source_capture:"direct"}),make("unknown",10,null),make("ambiguous",7,{utm_source:"unclassified-campaign"})]);
  assert.equal(result.adRevenueUSD,20);assert.equal(result.organicRevenueUSD,5);assert.equal(result.unattributedRevenueUSD,17);assert.equal(result.totalRevenueUSD,42);assert.equal(result.paidUnattributedCount,2);
});
