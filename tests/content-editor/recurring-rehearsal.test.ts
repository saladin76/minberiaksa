import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as albaraka from "../../lib/albaraka";
import * as schedule from "../../lib/donations/recurring-schedule";
import { inspectBankReply } from "../../lib/donations/bank-operations-inspection";
// Synthetic runtime boundaries; the real worker, lease, payload and inspection run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const id = "1".repeat(24), donor = "2".repeat(24), runId = "3".repeat(24);
function fixture() {
  let count = 10, writes = 0, captures = 0, queries = 0, reversals = 0, outcome = "approved", inquiryVerified = true;
  const normalDate = new Date(Date.now() + 30 * 86400000);
  const plan: Row = { id, donorId: donor, donor: { role: "ADMIN" }, provider: "ALBARAKA", status: "ACTIVE", amount: 1, amountUSD: 1, currency: "USD", teamSupport: 0, coverFees: false, frequency: "MONTHLY", timezone: "Europe/Istanbul", scheduleRule: null, createdAt: new Date(), nextBillingDate: normalDate, lastBillingDate: new Date(), chargeAttempts: 0, paymentCardId: "4".repeat(24), paymentCard: { expiryDate: "12/49", cardNumber: "encrypted", cardholderName: "Fixture" }, donations: [{ id: "signup", status: "PAID", paidAt: new Date() }], items: [], categoryItems: [], amountChangeLock: null, billingLeaseUntil: null };
  const donations: Row[] = [], audits: Row[] = [], bodies: Row[] = [];
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key,value]) => {
    if (key === "AND") return value.every((item: Row) => matches(row,item));
    if (key === "OR") return value.some((item: Row) => matches(row,item));
    if (key === "NOT") return !matches(row,value);
    if (key === "donations" && value.some) return row.donations.some((item: Row) => matches(item,value.some));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      if ("isSet" in value) return (row[key] !== undefined) === value.isSet;
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
      if ("not" in value) return row[key] != null;
      if ("in" in value) return value.in.includes(row[key]);
    }
    return value === null ? row[key] == null : row[key] === value;
  });
  const db: Row = {
    subscription: {
      findFirst: async ({where}: Row) => matches(plan,where) ? structuredClone(plan) : null,
      findUnique: async ({where}: Row) => where.id === id ? structuredClone(plan) : null,
      findMany: async ({where}: Row) => matches(plan,where) ? [structuredClone(plan)] : [],
      updateMany: async ({where,data}: Row) => { if (!matches(plan,where)) return {count:0}; writes++;Object.assign(plan,data);return {count:1}; },
      update: async ({data}: Row) => {writes++;Object.assign(plan,data);return structuredClone(plan);},
    },
    donation: {
      create: async ({data}: Row) => {writes++;const row={id:String(count++).padStart(24,"0"),paidAt:null,...data,items:[],categoryItems:[]};donations.push(row);return structuredClone(row);},
      findFirst: async ({where}: Row) => structuredClone(donations.find(row=>matches(row,where))??null),
      findUnique: async ({where}: Row) => structuredClone(donations.find(row=>matches(row,where))??null),
      update: async ({where,data}: Row) => {writes++;const row=donations.find(row=>matches(row,where))!;Object.assign(row,data);return structuredClone(row);},
    },
    auditLog: {
      findUnique: async ({where}: Row) => structuredClone(audits.find(row=>matches(row,where))??null),
      findFirst: async ({where}: Row) => structuredClone(audits.find(row=>matches(row,where))??null),
      create: async ({data}: Row) => {writes++;const row={id:String(count++).padStart(24,"0"),...data};if(audits.some(item=>item.id===row.id))throw Error('Duplicate');audits.push(row);return row;},
    },
  };
  db.$transaction=async (fn: (tx: Row)=>Promise<unknown>)=>fn(db);
  const dependencies: Row = {
    "server-only":{},"node:crypto":crypto,"../prisma":{prisma:db},"@/lib/prisma":{prisma:db},
    "../albaraka":albaraka,
    "@/lib/albaraka":{...albaraka,albarakaChargeCurrency:()=>"USD",albarakaRecurringConfig:()=>({...albaraka.albarakaRecurringConfig(),merchantNo:"fixture-merchant",terminalNo:"fixture-terminal",encKey:"fixture-key",enabled:true,mailOrder:false}),isAlbarakaRecurringEnabled:()=>true,
      albarakaService:async (action: string,body: Row)=>{assert.equal(action,"Sale");captures++;bodies.push(body);if(outcome==='unknown')throw Error('timeout');return {ServiceResponseData:{ResponseCode:outcome==='declined'?'05':'0000',ResponseDescription:outcome==='declined'?'Onaylanmadi':'Approved'},AuthCode:'AUTH1',ReferenceCode:'REF1'};},
      albarakaInquireSale:async()=>({state:'unknown',raw:null}),albarakaReverseSale:async()=>{reversals++;throw Error('No reversal permitted');}},
    "@/lib/card-crypto":{decryptCard:()=>"5400619360964581"},"@/lib/events/after-response":{runAfterResponse:()=>{throw Error('No recipient message permitted');}},
    "@/lib/events/dispatch":{},"@/lib/tracking/donation-conversion-server":{sendDonationFailedConversions:()=>{throw Error('No ad event permitted');}},
    "@/lib/exchange/rates-service":{getUsdBaseRatesForServer:async()=>({USD:1}),convertAmountInCurrencyToUsd:(v: number)=>v},
    "@/lib/exchange/convert-amount-in-currency-to-usd":{normalizeDonationCurrencyCode:(v: string)=>v},
    "@/lib/donations/donor-country-code":{getDonorCountryCodeForSnapshot:async()=>null},"@/lib/donations/access-token":{mintDonationAccessToken:()=>"fixture"},
    "./recurring-schedule":schedule,"./bank-operations-service":{bankDonationSelect:{}},
    "./bank-operations-provider":{callBankOperation:async(row: Row,action: string)=>{assert.equal(action,'INQUIRE');queries++;return {state:'SUCCEEDED',code:'0000',data:{transactions:inquiryVerified?[{OrderId:row.providerOrderId,Amount:'1.00',CurrencyCode:'US',TransactionType:'Sale',AuthCode:'AUTH1'}]:[]}};}},
    "./bank-operations-inspection":{inspectBankReply},
  };
  function load(file: string): Row {
    const mod={exports:{}};
    const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    new vm.Script(source).runInNewContext({module:mod,exports:mod.exports,Date,Map,Set,Buffer,structuredClone,process:{env:{}},console:{error(){}},setTimeout,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
    return mod.exports;
  }
  dependencies['./recurring-lease']=load('lib/donations/recurring-lease.ts');
  const worker=load('lib/donations/albaraka-recurring.ts');dependencies['./albaraka-recurring']=worker;
  dependencies['../albaraka']={...albaraka,isAlbarakaRecurringEnabled:()=>true,albarakaRecurringConfig:()=>({mailOrder:false})};
  const service=load('lib/donations/recurring-rehearsal.ts');
  const options={subscriptionId:id,donorId:donor,currency:'USD',maxTotal:'3.00',cycles:3,intervalSeconds:60,runId};
  return {plan,donations,audits,bodies,normalDate,worker,options,run:(extra:Row={},wait: (ms:number)=>Promise<void> = async()=>{})=>service.runRecurringRehearsal({...options,...extra},wait),stats:()=>({writes,captures,queries,reversals}),outcome:(v:string)=>{outcome=v;},inquiry:(v:boolean)=>{inquiryVerified=v;}};
}

test('preview cannot write, charge or lock a plan',async()=>{const f=fixture(),report=await f.run();assert.equal(report.state,'PREVIEW');assert.equal(report.maximumAdditionalCharge,3);assert.deepEqual(f.stats(),{writes:0,captures:0,queries:0,reversals:0});assert.equal(f.plan.amountChangeLock,null);});
test('three actual worker cycles use separate orders, verify the bank and preserve the ordinary schedule; replay sends no charge',async()=>{
 const f=fixture(),result=await f.run({execute:true});assert.equal(result.state,'COMPLETED');assert.equal(result.confirmed.length,3);assert.equal(f.plan.status,'PAUSED');assert.equal(f.stats().captures,3);assert.equal(f.stats().queries,3);assert.equal(new Set(f.donations.map(row=>row.providerOrderId)).size,3);assert.ok(f.donations.every(row=>row.paidAt&&row.billingReason==='subscription_test_cycle'));assert.ok(f.bodies.every(body=>body.IsMailOrder==='N'&&body.IsRecurring==='Y'&&body.CardInformationData.Cvc2===''));assert.equal(f.plan.nextBillingDate.toISOString(),f.normalDate.toISOString());assert.equal(f.plan.amountChangeLock,null);assert.equal((await f.run({execute:true})).newCharges,0);assert.equal(f.stats().captures,3);
});
for (const frequency of ['DAILY', 'FRIDAY']) test(`${frequency}: three bank-verified test cycles preserve the original cadence and stop the test plan`, async () => {
 const f=fixture();f.plan.frequency=frequency;
 const result=await f.run({execute:true});
 assert.equal(result.state,'COMPLETED');assert.equal(result.confirmed.length,3);assert.equal(f.stats().captures,3);assert.equal(f.stats().queries,3);
 assert.equal(f.plan.frequency,frequency);assert.equal(f.plan.nextBillingDate.toISOString(),f.normalDate.toISOString());assert.equal(f.plan.status,'PAUSED');
 assert.equal((await f.run({execute:true})).newCharges,0);assert.equal(f.stats().captures,3);
});
test('a bank decline stops at the first cycle with no ordinary retry left enabled',async()=>{const f=fixture();f.outcome('declined');const r=await f.run({execute:true});assert.equal(r.state,'STOPPED');assert.equal(f.stats().captures,1);assert.equal(f.plan.status,'PAYMENT_FAILED');assert.equal(f.plan.nextBillingDate.toISOString(),f.normalDate.toISOString());assert.equal(f.plan.amountChangeLock,null);assert.equal((await f.run({execute:true})).state,'STOPPED');assert.equal(f.stats().captures,1);});
test('an uncertain charge is never repeated or reversed and keeps a durable run lock',async()=>{const f=fixture();f.outcome('unknown');const r=await f.run({execute:true});assert.equal(r.state,'REVIEW_REQUIRED');assert.equal(f.stats().captures,1);assert.equal(f.stats().reversals,0);assert.equal(r.lockRetained,true);assert.equal(f.plan.amountChangeLock,'RECURRING_TEST:'+runId);await assert.rejects(f.run({execute:true}));assert.equal(f.stats().captures,1);});
test('a paid cycle whose bank inquiry is unverified blocks the next charge; a resume only inquires about the paid cycle',async()=>{const f=fixture();f.inquiry(false);const r=await f.run({execute:true});assert.equal(r.state,'REVIEW_REQUIRED');assert.equal(f.stats().captures,1);f.inquiry(true);assert.equal((await f.run({execute:true})).state,'COMPLETED');assert.equal(f.stats().captures,3);});
test('wrong owner, ordinary donors, old plans, insufficient cap and excessive cycles never write or reach a bank',async()=>{
 for(const variant of ['owner','role','old','budget','currency','cycles']){const f=fixture();const extra:Row={execute:true};if(variant==='owner')extra.donorId='9'.repeat(24);if(variant==='role')f.plan.donor.role='DONOR';if(variant==='old')f.plan.createdAt=new Date(Date.now()-2*86400000);if(variant==='budget')extra.maxTotal='2.99';if(variant==='currency')extra.currency='EUR';if(variant==='cycles')extra.cycles=4;await assert.rejects(f.run(extra));assert.equal(f.stats().writes,0,variant);assert.equal(f.stats().captures,0,variant);}
});
test('changing a plan during the pause cannot increase the next collection beyond the approved cap',async()=>{const f=fixture();await assert.rejects(f.run({execute:true},async ms=>{if(ms===60000)f.plan.amount=2;}),/REHEARSAL_PLAN_CHANGED/);assert.equal(f.stats().captures,1);assert.ok(f.plan.amountChangeLock);});
test('competing starts cannot claim the same plan twice or exceed the three-cycle cap',async()=>{const f=fixture();const results=await Promise.allSettled([f.run({execute:true}),f.run({execute:true})]);assert.ok(results.some(result=>result.status==='fulfilled'));assert.equal(f.stats().captures,3);assert.equal(new Set(f.donations.map(row=>row.providerOrderId)).size,3);});
