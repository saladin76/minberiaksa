import type { PrismaClient } from "@prisma/client";
import { withRecurringLease } from "./recurring-lease";
import { inspectRecurringBillingSafety, applyRecurringBillingSafety } from "./recurring-billing-safety";

type RepairDatabase = Pick<PrismaClient, "subscription" | "donation">;
const select = { id:true,provider:true,status:true,frequency:true,timezone:true,scheduleRule:true,amount:true,nextBillingDate:true,lastBillingDate:true,chargeAttempts:true,paymentCardId:true,paypalVaultId:true,amountChangeLock:true,billingLeaseUntil:true } as const;

/** Read-only by default; apply only postpones dates or pauses uncertain plans.
 * Provider-managed billing and QA/repricing locks are outside this repair. */
export async function repairRecurringScheduleSafety(db:RepairDatabase, options:{apply?:boolean;now?:Date;maxPlans?:number}={}) {
  const now=options.now??new Date(),apply=options.apply===true,maxPlans=options.maxPlans??10_000;
  const result={readOnly:!apply,checkedAt:now.toISOString(),policyVersion:2,paymentCaptures:0,providerCalls:0,recipientMessages:0,
    complete:true,scanned:0,ready:0,postponements:0,holds:0,changed:0,busy:0,
    decisions:[] as Array<{subscriptionId:string;provider:string|null;frequency:string|null;state:string;reason:string;previousAt:string|null;nextAt:string|null;applied:boolean}>,
  };
  let cursor:string|undefined;
  for(;;){
    const rows=await db.subscription.findMany({where:{provider:{in:["ALBARAKA","PAYPAL"]},status:"ACTIVE",lastBillingDate:{not:null},nextBillingDate:{not:null},...(cursor?{id:{gt:cursor}}:{})},orderBy:{id:"asc"},take:100,select});
    for(const row of rows){
      if(result.scanned>=maxPlans){result.complete=false;return result;}
      if(cursor&&row.id<=cursor)throw new Error("RECURRING_REPAIR_CURSOR_STALLED");
      cursor=row.id;result.scanned++;
      if(row.amountChangeLock||row.billingLeaseUntil&&row.billingLeaseUntil>now){result.busy++;continue;}
      let decision=await inspectRecurringBillingSafety(db,row,now),changed=false;
      if(decision.state==="ready"){result.ready++;continue;}
      if(apply){
        const guarded=await withRecurringLease(db,row,now,async()=>{
          const fresh=await inspectRecurringBillingSafety(db,row,now);
          return {decision:fresh,changed:await applyRecurringBillingSafety(db,row,fresh)};
        });
        if(!guarded){result.busy++;continue;}
        decision=guarded.decision;changed=guarded.changed;
      }
      if(decision.state==="ready"){result.ready++;continue;}
      if(decision.state==="postpone")result.postponements++;else result.holds++;
      if(changed)result.changed++;
      result.decisions.push({subscriptionId:row.id,provider:row.provider,frequency:row.frequency,state:decision.state,reason:decision.reason,previousAt:row.nextBillingDate?.toISOString()??null,nextAt:decision.state==="postpone"?decision.date.toISOString():null,applied:changed});
    }
    if(rows.length<100)return result;
  }
}
