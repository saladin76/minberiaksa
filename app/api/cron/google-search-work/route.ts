import { NextRequest, NextResponse } from "next/server";
import { emergencyPauseSearchPlan } from "@/lib/marketing/google-search/emergency-pause";
import { prisma } from "@/lib/prisma";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { continueSearchPlanning } from "@/lib/marketing/google-search/planner";
import { optimizeSearchPlan } from "@/lib/marketing/google-search/optimizer";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started=Date.now();let failedPlans=0;
  const errors:{id:string;phase:string;code:string}[]=[];
  const code=(error:unknown)=>error instanceof Error && /^[A-Z0-9_:]+$/.test(error.message)?error.message:"SEARCH_WORK_FAILED";
  const pending = await prisma.googleSearchPlan.aggregateRaw({pipeline:[{$match:{status:"RECONCILE_REQUIRED","evidence.emergencyPausePending":true}},{$limit:10},{$project:{_id:1}}],options:{maxTimeMS:15000}});
  if(!Array.isArray(pending))throw new Error("EMERGENCY_QUEUE_UNAVAILABLE");
  const emergency=pending.map(row=>{const id=(row as {_id?:{$oid?:string}})._id?.$oid;if(!id||!/^[a-f0-9]{24}$/i.test(id))throw new Error("EMERGENCY_QUEUE_INVALID");return{id};});
  for(const plan of emergency){try{await emergencyPauseSearchPlan(plan.id);}catch(error){failedPlans++;errors.push({id:plan.id,phase:"emergency-pause",code:code(error)});}}
  const planning = await prisma.googleSearchPlan.findMany({ where: { status: "PLANNING" }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 2 });
  for (const plan of planning) {
    try {await continueSearchPlanning(plan.id);const result=await prisma.googleSearchPlan.findUnique({where:{id:plan.id},select:{status:true,lastError:true}});if(result?.status==="PLANNING_FAILED"){failedPlans++;errors.push({id:plan.id,phase:"planning",code:result.lastError||"SEARCH_WORK_FAILED"});}}
    catch(error){failedPlans++;errors.push({id:plan.id,phase:"planning",code:code(error)});}
  }
  const optimization = await prisma.googleSearchPlan.findMany({ where: { status: "ACTIVE", automationEnabled: true, OR: [{ lastReviewAt: null }, { lastReviewAt: { lte: new Date(Date.now() - 6 * 3600000) } }] }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 2 });
  for (const plan of optimization) {
    try {await optimizeSearchPlan(plan.id);const result=await prisma.googleSearchPlan.findUnique({where:{id:plan.id},select:{lastError:true}});if(result?.lastError){failedPlans++;errors.push({id:plan.id,phase:"optimization",code:result.lastError});}}
    catch(error){failedPlans++;errors.push({id:plan.id,phase:"optimization",code:code(error)});}
  }
  return NextResponse.json({ ok: failedPlans===0, planningSteps: planning.length, optimizationReviews: optimization.length, durationMs:Date.now()-started, failedPlans, emergencyPauseChecks:emergency.length, errors });
}
