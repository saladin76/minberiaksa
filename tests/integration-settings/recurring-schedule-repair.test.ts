import test from "node:test";
import assert from "node:assert/strict";
import { repairRecurringScheduleSafety } from "../../lib/donations/recurring-schedule-repair";
// Synthetic data; exercises the actual paging, lease and conditional updates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
const now=new Date("2026-11-02T16:30:00Z"),paidAt=new Date("2026-11-02T00:00:00Z");
function match(row:Row,where:Row):boolean{return Object.entries(where).every(([key,value])=>{
 if(key==="AND")return value.every((part:Row)=>match(row,part));if(key==="OR")return value.some((part:Row)=>match(row,part));
 if(value instanceof Date)return row[key]?.getTime()===value.getTime();if(value===null)return row[key]==null;
 if(value&&typeof value==="object"){if("in" in value)return value.in.includes(row[key]);if("not" in value)return value.not===null?row[key]!=null:row[key]!==value.not;if("isSet" in value)return(row[key]!==undefined)===value.isSet;if("lte" in value)return row[key]!=null&&row[key]<=value.lte;if("gt" in value)return row[key]>value.gt;}return row[key]===value;
});}
function fixture(count=1){
 const rows:Row[]=Array.from({length:count},(_,i)=>({id:String(i+1).padStart(24,"0"),provider:"ALBARAKA",status:"ACTIVE",frequency:"DAILY",timezone:"Europe/Istanbul",scheduleRule:{kind:"daily",hour:19,minute:30},amount:1,nextBillingDate:now,lastBillingDate:paidAt,chargeAttempts:2,paymentCardId:"card",paypalVaultId:null,amountChangeLock:null,billingLeaseUntil:null}));
 const writes:Row[]=[],queries:Row[]=[];let beforeClaim:(()=>void)|undefined,beforeInspection:(()=>void)|undefined;
 const db={subscription:{findMany:async(query:Row)=>{queries.push(query);return rows.filter(row=>match(row,query.where)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,query.take).map(row=>({...row}));},updateMany:async(query:Row)=>{writes.push(query);if(query.data.billingLeaseToken){beforeClaim?.();beforeClaim=undefined;}const selected=rows.filter(row=>match(row,query.where));for(const row of selected)Object.assign(row,query.data);return{count:selected.length};}},donation:{findMany:async()=>{if(rows.some(row=>row.billingLeaseToken))beforeInspection?.();return[{id:"payment",paidAt,billingReason:"subscription_cycle",providerTxnType:"RecurringSale"}];},findFirst:async(query:Row)=>rows.find(row=>row.id===query.where.subscriptionId)?.unknown?{id:"uncertain"}:null}} as unknown as Parameters<typeof repairRecurringScheduleSafety>[0];
 return{rows,writes,queries,db,onClaim:(work:()=>void)=>{beforeClaim=work;},onInspection:(work:()=>void)=>{beforeInspection=work;}};
}
test("repair defaults to a paged read-only audit without lease writes or captures",async()=>{
 const f=fixture(205),snapshot=JSON.stringify(f.rows),r=await repairRecurringScheduleSafety(f.db,{now});assert.equal(r.complete,true);assert.equal(r.scanned,205);assert.equal(r.postponements,205);assert.equal(r.changed,0);assert.equal(r.readOnly,true);assert.equal(f.queries.length,3);assert.equal(f.writes.length,0);assert.equal(JSON.stringify(f.rows),snapshot);assert.equal(r.providerCalls,0);assert.equal(r.paymentCaptures,0);assert.equal(r.recipientMessages,0);
});
test("repair postpones or pauses, skips QA/leases/external/inactive plans, and can be repeated safely",async()=>{
 const f=fixture(7);f.rows[1].unknown=true;f.rows[2].amountChangeLock="QA";f.rows[3].billingLeaseUntil=new Date(now.getTime()+60000);f.rows[4].provider="STRIPE";f.rows[5].status="CANCELLED";f.rows[6].provider="PAYPAL";f.rows[6].paypalVaultId="vault";
 const r=await repairRecurringScheduleSafety(f.db,{now,apply:true});assert.equal(r.scanned,5);assert.equal(r.busy,2);assert.equal(r.changed,3);assert.equal(r.holds,1);assert.equal(r.postponements,2);
 for(const index of [0,6]){assert.equal(f.rows[index].nextBillingDate.toISOString(),"2026-11-03T16:30:00.000Z");assert.equal(f.rows[index].status,"ACTIVE");assert.equal(f.rows[index].chargeAttempts,0);assert.equal(f.rows[index].billingLeaseToken,null);}
 assert.equal(f.rows[1].status,"PAUSED");assert.equal(f.rows[1].lastChargeError,"RECURRING_OUTCOME_REVIEW_REQUIRED");for(const i of [2,3,4,5])assert.equal(f.rows[i].nextBillingDate,now);
 const again=await repairRecurringScheduleSafety(f.db,{now,apply:true});assert.equal(again.changed,0);assert.equal(again.ready,2);
});
test("a cancellation before claim wins without reactivation",async()=>{
 const f=fixture();f.onClaim(()=>{f.rows[0].status="CANCELLED";});const r=await repairRecurringScheduleSafety(f.db,{now,apply:true});assert.equal(r.busy,1);assert.equal(r.changed,0);assert.equal(f.rows[0].status,"CANCELLED");assert.equal(f.rows[0].nextBillingDate,now);
});
test("ledger is rechecked under the lease before applying a decision",async()=>{
 const f=fixture();f.onInspection(()=>{f.rows[0].unknown=true;});const r=await repairRecurringScheduleSafety(f.db,{now,apply:true});assert.equal(r.holds,1);assert.equal(r.postponements,0);assert.equal(f.rows[0].status,"PAUSED");assert.equal(f.rows[0].nextBillingDate,now);
});
test("a date edited during inspection is not overwritten",async()=>{
 const f=fixture(),edited=new Date("2026-12-01T16:30:00Z");f.onInspection(()=>{f.rows[0].nextBillingDate=edited;});const r=await repairRecurringScheduleSafety(f.db,{now,apply:true});assert.equal(r.changed,0);assert.equal(f.rows[0].nextBillingDate,edited);assert.equal(f.rows[0].billingLeaseToken,null);
});
test("bounded audit explicitly reports incomplete coverage",async()=>{
 const f=fixture(101),r=await repairRecurringScheduleSafety(f.db,{now,maxPlans:100});assert.equal(r.scanned,100);assert.equal(r.complete,false);assert.equal(f.writes.length,0);
});
