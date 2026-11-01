import { subscriptionFrequencyWhere } from "../../lib/dashboard/recurring-frequency-filter";
/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures deliberately supply partial Prisma clients and VM module exports. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import { albarakaResponseMac, isStoredCardExpired } from "../../lib/albaraka";
import { albaraka3DLinkageError } from "../../lib/donations/albaraka-3d-verification";
import { billingLeaseAvailable } from "../../lib/donations/recurring-lease";
type Row = Record<string, any>;
function service() {
 const mod={exports:{} as Row}; const deps: Row={"node:crypto":crypto,"@/lib/albaraka":{albarakaResponseMac,isStoredCardExpired},"./albaraka-3d-verification":{albaraka3DLinkageError},"../dashboard/recurring-frequency-filter":{subscriptionFrequencyWhere},"./recurring-lease":{billingLeaseAvailable}};
 new vm.Script(ts.transpileModule(readFileSync("lib/donations/subscription-card-verification.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText).runInNewContext({module:mod,exports:mod.exports,Buffer,Date,Error,require:(id:string)=>{assert.ok(id in deps,id);return deps[id];}});return mod.exports;
}
const api=service(), now=new Date("2026-11-01T12:00:00Z"), cfg={merchantNo:"merchant",terminalNo:"terminal",encKey:"fixture-secret"};
function matches(row:Row,where:Row):boolean{return Object.entries(where).every(([key,expected])=>{
 if(key==="AND")return expected.every((x:Row)=>matches(row,x));if(key==="OR")return expected.some((x:Row)=>matches(row,x));
 const value=row[key]; if(expected instanceof Date)return value instanceof Date&&value.getTime()===expected.getTime();
 if(expected&&typeof expected==="object"){if("not"in expected)return value!==expected.not;if("isSet"in expected)return (value!==undefined)===expected.isSet;if("lte"in expected)return value<=expected.lte;if("gt"in expected)return value>expected.gt;}
 return value===expected;
});}
function fixture() {
 const card={id:"c".repeat(24),userId:"d".repeat(24),cardNumber:"encrypted-fixture",expiryDate:"01/30"};
 let state:Row={card,verification:{id:"a".repeat(24),subscriptionId:"b".repeat(24),donorId:card.userId,paymentCardId:card.id,oldPaymentCardId:"e".repeat(24),orderId:"A".repeat(20),tokenHash:api.cardVerificationHash("fixture-token"),cardDigest:api.storedCardDigest(card),status:"PENDING",amount:10,currency:"USD",frequency:"DAILY",teamSupport:0,coverFees:false,amountMinor:1000,currencyCode:"US",merchantNo:cfg.merchantNo,terminalNo:cfg.terminalNo,nextBillingDate:new Date("2026-11-02T12:00:00Z"),expiresAt:new Date(now.getTime()+900000),consentSnapshot:{scope:"FUTURE_CYCLES_SAME_PLAN"}},logs:[]};
 state.plan={id:state.verification.subscriptionId,donorId:card.userId,provider:"ALBARAKA",status:"ACTIVE",paymentCardId:state.verification.oldPaymentCardId,amount:10,currency:"USD",frequency:"DAILY",teamSupport:0,coverFees:false,nextBillingDate:state.verification.nextBillingDate};
 let failAudit=false,writes=0;
 const client=(s:Row):Row=>({subscriptionCardVerification:{findUnique:async()=>s.verification,updateMany:async({where,data}:Row)=>{if(!matches(s.verification,where))return {count:0};Object.assign(s.verification,data);return{count:1};}},creditCard:{findFirst:async({where}:Row)=>s.card&&matches(s.card,where)?s.card:null},subscription:{updateMany:async({where,data}:Row)=>{if(!matches(s.plan,where))return{count:0};Object.assign(s.plan,data);return{count:1};}},auditLog:{create:async({data}:Row)=>{if(failAudit)throw Error("audit down");s.logs.push(data);}}});
 const db:Row={subscriptionCardVerification:{findUnique:async()=>state.verification},$transaction:async(fn:any)=>{const draft=structuredClone(state);const result=await fn(client(draft));state=draft;writes++;return result;}};
 const raw:Row={OrderId:state.verification.orderId,Amount:"1000",Currency:"US",MerchantId:cfg.merchantNo,TranType:"Sale",MdStatus:"1",ECI:"05",CAVV:"fixture",MD:"fixture",SecureTransactionId:"fixture"};
 const sign=()=>{raw.MacNew=albarakaResponseMac(raw,cfg.encKey);};sign();
 return{db,raw,state:()=>state,sign,failAudit:()=>{failAudit=true;},writes:()=>writes,run:(token="fixture-token")=>api.completeSubscriptionCardVerification(db,state.verification.id,token,raw,cfg,now)};
}
test("full signed bank authentication replaces only the future card and creates no payment",async()=>{
 const f=fixture(),before=structuredClone(f.state().plan);assert.equal((await f.run()).ok,true);assert.equal(f.state().plan.paymentCardId,f.state().card.id);for(const key of Object.keys(before).filter(x=>x!=="paymentCardId"))assert.deepEqual(f.state().plan[key],before[key]);assert.equal(f.state().logs.length,1);assert.equal(f.state().logs[0].metadata.captures,0);assert.equal(f.state().verification.status,"COMPLETED");
 assert.equal((await f.run()).ok,true);assert.equal(f.writes(),1);assert.equal(f.state().logs.length,1);
});
test("wrong nonce, forged signature and half-3D cannot change a card",async()=>{
 const wrong=fixture();assert.equal((await wrong.run("wrong-token")).ok,false);assert.equal(wrong.writes(),0);
 const signature=fixture();signature.raw.MacNew="forged";assert.equal((await signature.run()).ok,false);assert.equal(signature.writes(),0);
 for(const status of ["0","2","3","4","5","7","8"]){const f=fixture();f.raw.MdStatus=status;f.sign();assert.equal((await f.run()).ok,false,status);assert.equal(f.writes(),0);}
});
test("a valid signature for another amount, order, currency or merchant is rejected",async()=>{
 for(const patch of [{Amount:"1001"},{OrderId:"B".repeat(20)},{Currency:"TL"},{MerchantId:"other"},{TranType:"Auth"}]){const f=fixture();Object.assign(f.raw,patch);f.sign();assert.equal((await f.run()).ok,false,JSON.stringify(patch));assert.equal(f.writes(),0);}
});
test("a changed amount, schedule, frequency, fee, owner, card or cancellation cannot reuse the authorization",async()=>{
 for(const patch of [{amount:11},{currency:"EUR"},{frequency:"MONTHLY"},{teamSupport:1},{coverFees:true},{donorId:"f".repeat(24)},{paymentCardId:"f".repeat(24)},{status:"CANCELLED"},{nextBillingDate:new Date("2026-11-03T12:00:00Z")},{billingLeaseUntil:new Date(now.getTime()+1000)},{amountChangeLock:"locked"}]){const f=fixture();Object.assign(f.state().plan,patch);const old=f.state().plan.paymentCardId;assert.equal((await f.run()).ok,false,JSON.stringify(patch));assert.equal(f.state().plan.paymentCardId,old);assert.equal(f.state().verification.status,"PENDING");assert.equal(f.writes(),0);}
});
test("expired checks, changed/foreign/expired cards and an audit failure preserve the old card",async()=>{
 for(const alter of [(s:Row)=>s.verification.expiresAt=new Date(now.getTime()-1),(s:Row)=>s.card.userId="f".repeat(24),(s:Row)=>s.card.cardNumber="changed-ciphertext",(s:Row)=>s.card.expiryDate="01/20"]){const f=fixture();alter(f.state());assert.equal((await f.run()).ok,false);assert.equal(f.writes(),0);}
 const f=fixture();f.failAudit();assert.equal((await f.run()).ok,false);assert.equal(f.state().verification.status,"PENDING");assert.equal(f.state().plan.paymentCardId,"e".repeat(24));assert.equal(f.writes(),0);
});
test("legacy absent card and schedule fields can be repaired after a real bank authentication",async()=>{
 const f=fixture();f.state().verification.oldPaymentCardId=null;f.state().verification.nextBillingDate=null;delete f.state().plan.paymentCardId;delete f.state().plan.nextBillingDate;assert.equal((await f.run()).ok,true);assert.equal(f.state().plan.paymentCardId,f.state().card.id);assert.equal(f.state().plan.nextBillingDate,undefined);
});

test("a signed but incomplete 3D bank result is not authorization",async()=>{
 for(const field of ["SecureTransactionId","CAVV","ECI","MD"]){const f=fixture();f.raw[field]="";f.sign();assert.equal((await f.run()).ok,false,field);assert.equal(f.writes(),0);}
});

test("monthly card authentication matches a legacy missing or null cadence without charging or changing its billing date", async () => {
 for(const missing of [true,false]) { const f=fixture();f.state().verification.frequency="MONTHLY";if(missing)delete f.state().plan.frequency;else f.state().plan.frequency=null;const date=f.state().plan.nextBillingDate;
 assert.equal((await f.run()).ok,true);assert.equal(f.state().plan.paymentCardId,f.state().card.id);assert.equal(f.state().plan.nextBillingDate.getTime(),date.getTime());assert.equal(f.writes(),1); }
});
