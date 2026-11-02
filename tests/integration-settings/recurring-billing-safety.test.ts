import test from "node:test";
import assert from "node:assert/strict";
import { recurringBillingDecision, inspectRecurringBillingSafety, applyRecurringBillingSafety, type BillingSafetyPlan } from "../../lib/donations/recurring-billing-safety";
import { firstChargeForPlan, nextChargeAfterPayment, nextRetryForPlan, wallClock } from "../../lib/donations/recurring-schedule";
import { recurringBillingPolicy } from "../../lib/donations/recurring-policy-copy";
import { readdirSync } from "node:fs";

const at=(iso:string)=>new Date(iso);
const plan=(values:Partial<BillingSafetyPlan>={}):BillingSafetyPlan=>({id:"plan",provider:"ALBARAKA",status:"ACTIVE",amount:1,frequency:"DAILY",timezone:"Europe/Istanbul",scheduleRule:{kind:"daily",hour:19,minute:30},nextBillingDate:at("2026-11-02T16:30:00Z"),lastBillingDate:at("2026-11-02T00:00:00Z"),chargeAttempts:0,...values});

test("03:00 daily retry covers its local day, preventing the 19:30 debit",()=>{
 const p=plan(),decision=recurringBillingDecision(p,{paidAt:p.lastBillingDate!,initial:false},p.nextBillingDate!);assert.equal(decision.state,"postpone");
 if(decision.state==="postpone"){assert.equal(decision.date.toISOString(),"2026-11-03T16:30:00.000Z");assert.equal(decision.resetAttempts,true);}
});
test("October 31 signup/day 1 renews December 1; a later November 2 renewal retains December 1",()=>{
 const p=plan({frequency:"MONTHLY",scheduleRule:{kind:"monthDay",day:1,hour:9,minute:30},nextBillingDate:at("2026-11-01T06:30:00Z")});
 assert.equal(firstChargeForPlan(p,at("2026-10-31T13:00:04Z")).toISOString(),"2026-12-01T06:30:00.000Z");
 assert.equal(recurringBillingDecision(p,{paidAt:at("2026-10-31T13:00:04Z"),initial:true},p.nextBillingDate!).state,"postpone");
 assert.equal(nextChargeAfterPayment(p,at("2026-11-02T14:00:04Z")).toISOString(),"2026-12-01T06:30:00.000Z");
});
test("anniversaries clamp month ends and leap years without skipping an extra month for clock seconds",()=>{
 const p=plan({frequency:"MONTHLY",scheduleRule:{kind:"monthDay",day:31,hour:9,minute:30}});
 assert.equal(firstChargeForPlan(p,at("2028-01-31T06:30:04Z")).toISOString(),"2028-02-29T06:30:00.000Z");
 assert.equal(firstChargeForPlan(p,at("2027-01-31T06:30:04Z")).toISOString(),"2027-02-28T06:30:00.000Z");
 assert.equal(nextChargeAfterPayment(p,at("2027-02-28T06:30:04Z")).toISOString(),"2027-03-31T06:30:00.000Z");
});
test("Friday retries remain Friday, including a retry crossing midnight and an old Saturday date",()=>{
 const p=plan({frequency:"FRIDAY",scheduleRule:{kind:"weekday",weekday:5,hour:9,minute:30},nextBillingDate:at("2026-11-07T10:00:00Z")});
 assert.equal(nextRetryForPlan(p,1,at("2026-11-06T20:30:00Z"))?.toISOString(),"2026-11-13T06:30:00.000Z");
 assert.equal(nextRetryForPlan(p,1,at("2026-11-06T06:30:00Z"))?.toISOString(),"2026-11-06T07:30:00.000Z");
 const decision=recurringBillingDecision(p,{paidAt:at("2026-10-30T06:30:00Z"),initial:false},p.nextBillingDate!);
 assert.equal(decision.state,"postpone");if(decision.state==="postpone"){assert.equal(decision.resetAttempts,false);assert.equal(decision.date.toISOString(),"2026-11-13T06:30:00.000Z");}
 assert.equal(nextRetryForPlan(p,4,at("2026-11-06T06:30:00Z")),null);
});
test("daily periods remain local days across DST gaps and folds",()=>{
 const p=plan({timezone:"America/New_York",scheduleRule:{kind:"daily",hour:2,minute:30}}),next=nextChargeAfterPayment(p,at("2026-03-07T07:30:00Z"));
 assert.deepEqual([wallClock(next,p.timezone!).day,wallClock(next,p.timezone!).hour],[8,3]);
 const fold=plan({timezone:"America/New_York",scheduleRule:{kind:"daily",hour:1,minute:30}});assert.equal(wallClock(nextChargeAfterPayment(fold,at("2026-11-01T05:30:00Z")),fold.timezone!).day,2);
});
test("invalid cadence, timezone, rule, date and future proof stop billing",()=>{
 for(const change of [{frequency:"WEEKLY"},{timezone:"bad/zone"},{scheduleRule:{kind:"monthDay",day:1}},{scheduleRule:{kind:"daily",hour:25}},{scheduleRule:{kind:"daily",hour:9,minute:-1}},{nextBillingDate:null}])assert.equal(recurringBillingDecision(plan(change),{paidAt:at("2026-11-01T00:00:00Z"),initial:false},at("2026-11-02T00:00:00Z")).state,"hold");
 assert.equal(recurringBillingDecision(plan(),{paidAt:at("2026-11-03T00:00:00Z"),initial:false},at("2026-11-02T00:00:00Z")).state,"hold");
});
test("an optimistic plan pointer is not evidence, and unresolved ledger attempts prevent another debit",async()=>{
 let payments:Array<{id:string;paidAt:Date;billingReason:string|null;providerTxnType:string|null}>=[],unresolved:{id:string}|null=null;
 const db={donation:{findMany:async()=>payments,findFirst:async()=>unresolved}} as unknown as Parameters<typeof inspectRecurringBillingSafety>[0];
 assert.equal((await inspectRecurringBillingSafety(db,plan(),at("2026-11-02T16:30:00Z"))).state,"hold");
 payments=[{id:"first",paidAt:at("2026-11-01T00:00:00Z"),billingReason:null,providerTxnType:null}];assert.equal((await inspectRecurringBillingSafety(db,plan(),at("2026-11-02T16:30:00Z"))).state,"ready");
 unresolved={id:"unknown"};assert.equal((await inspectRecurringBillingSafety(db,plan(),at("2026-11-02T16:30:00Z"))).state,"hold");
});
test("conditional updates only postpone and never activate a concurrently changed subscription",async()=>{
 const writes:unknown[]=[];let count=1;
 const db={subscription:{updateMany:async(query:unknown)=>{writes.push(query);return{count};}}} as unknown as Parameters<typeof applyRecurringBillingSafety>[0];
 const p=plan(),decision=recurringBillingDecision(p,{paidAt:p.lastBillingDate!,initial:false},p.nextBillingDate!);
 assert.equal(await applyRecurringBillingSafety(db,p,decision),true);const q=writes[0] as {where:{status:string};data:{nextBillingDate:Date;status?:string}};
 assert.equal(q.where.status,"ACTIVE");assert.equal(q.data.status,undefined);assert.ok(q.data.nextBillingDate>p.nextBillingDate!);count=0;assert.equal(await applyRecurringBillingSafety(db,p,decision),false);
});
test("all supported checkout languages have distinct nonempty policies for all three cadences",()=>{
 const locales=readdirSync("i18n/messages").filter(file=>file.endsWith(".json")).map(file=>file.slice(0,-5));assert.equal(locales.length,19);
 for(const locale of locales){const values=(["DAILY","FRIDAY","MONTHLY"] as const).map(frequency=>recurringBillingPolicy(locale,frequency));assert.equal(new Set(values).size,3);assert.ok(values.every(value=>value.trim().length>10));if(locale!=="en")assert.notEqual(values[0],recurringBillingPolicy("en","DAILY"));}
});
