// No captures, refunds, provider calls or recipient messages.
import { createRequire } from "node:module";
import { loadReleaseModule } from "./release-metadata-runtime.mjs";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const args=process.argv.slice(2);
if(args.some(arg=>!["--apply","--details"].includes(arg)))throw new Error("Unknown recurring safety option");
const {prisma}=await loadReleaseModule("lib/prisma.ts");
try{
  const {repairRecurringScheduleSafety}=await loadReleaseModule("lib/donations/recurring-schedule-repair.ts");
  const result=await repairRecurringScheduleSafety(prisma,{apply:args.includes("--apply")});
  const {decisions,...summary}=result;
  if(args.includes("--apply")&&result.changed){
    const {writeAuditLog}=await loadReleaseModule("lib/audit-log.ts");
    await writeAuditLog({actorRole:"SYSTEM",stream:"TEAM",action:"RECURRING_SCHEDULE_SAFETY_REPAIR",entityType:"Subscription",messageAr:`مراجعة أمان الجدولة: تأجيل ${result.postponements} موعد وإيقاف ${result.holds} اشتراك للمراجعة؛ لم يُطلب تحصيل.`,metadata:{...summary}});
  }
  console.log(JSON.stringify({...summary,...(!args.includes("--apply")?{databaseWrites:0}:{}),...(args.includes("--details")?{decisions}:{} )},null,2));
  if(!result.complete)process.exitCode=1;
}catch(error){console.error(JSON.stringify({error:"RECURRING_SCHEDULE_SAFETY_FAILED",name:error instanceof Error?error.name:"Unknown",paymentCaptures:0,providerCalls:0,recipientMessages:0}));process.exitCode=1;}
finally{await prisma.$disconnect();}
