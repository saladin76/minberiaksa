#!/usr/bin/env node
/**
 * READ ONLY — Elastic Email incident diagnosis for lapsed-donation email.
 * Prints only aggregate known-category counts and frequency of anonymized
 * message shapes; never contact details, email domains, message IDs, errors,
 * body text, provider keys, donor IDs or message/recipient-specific timestamps.
 * Never calls a provider, email sender, cron, sync or any mutation API.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const require = createRequire(resolve(process.cwd(), "package.json"));
require("@next/env").loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {PrismaClient}=require("@prisma/client");
const db=new PrismaClient({log:[]});
const start=new Date("2026-11-06T00:00:00Z"),end=new Date("2026-11-09T00:00:00Z");
const safeType=v=>{
  const s=String(v||"").toLowerCase().replace(/[^a-z]/g,"");
  return ["suppress","error","failed","bounced","sent","delivered","opened","open","clicked","click","unsubscribed","spam"].includes(s)?s.toUpperCase():"OTHER";
};
const tally=(bag,key)=>{bag[key]=(bag[key]||0)+1};
const top=(bag,limit=28)=>Object.entries(bag).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([reason,count])=>({reason,count}));
function classify(error){
  const s=String(error||"").toLowerCase();
  if(!s.trim())return "NO_DETAIL";
  // More specific vendor states first; a generic "spam" word often appears
  // in account-only or "AccountProblem" text.
  if(/transactional.only|transactional\s+emails?\s+only|contact\s+is\s+transactional|notdelivered.*transactional/.test(s))return "TRANSACTIONAL_ONLY_CONTACT";
  if(/unsubscrib|complaint|opted.out|opt.out|do.not.contact|block.list|blocked.contact|contact.*block/.test(s))return "CONTACT_SUPPRESSED_OR_OPTED_OUT";
  if(/no.mailbox|nomailbox|unknown.user|no.such.user|mailbox.*not.exist|invalid.address|invalid.recipient|address.*invalid/.test(s))return "INVALID_RECIPIENT";
  if(/trust.level|delivery to this domain is not permitted|not permitted on your account/.test(s))return "TRUST_LEVEL_OR_DOMAIN_RESTRICTION";
  if(/account.problem|accountproblem|spam.block|account.*restrict|account.*suspend/.test(s))return "ACCOUNT_OR_SPAM_BLOCK";
  if(/notdeliveredcancelled|not.delivered.cancelled|abuse.detection|manual.cancel/.test(s))return "PROVIDER_CANCELLED";
  if(/notdelivered|not.delivered|suppress|not.allowed|prohibit|policy/.test(s))return "DELIVERY_POLICY_OR_SUPPRESSION";
  if(/blacklist|blocklist|black.list|poor.reputation|spam|reputation|content.filter/.test(s))return "SPAM_REPUTATION_OR_CONTENT";
  if(/throttl|rate.limit|quota|greylist|too.many/.test(s))return "THROTTLE_RATE_OR_GREYLIST";
  if(/dns.problem|dnsproblem|spf.problem|spfproblem|mx.record|dns lookup/.test(s))return "DNS_OR_SPF";
  if(/timeout|timed.out|connection.problem|connect.problem|socket|network/.test(s))return "NETWORK_OR_TIMEOUT";
  if(/service.unavailable|internal.server.error|server.error|temporary.error/.test(s))return "TEMPORARY_PROVIDER_OR_MAIL_SERVER";
  if(/invalid.*api|unauthorized|access.denied|auth.fail/.test(s))return "AUTHENTICATION_FAILURE";
  return "OTHER_UNCLASSIFIED";
}
function safeSignature(text){
  const redacted=String(text||"").toLowerCase()
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,"[email]")
    .replace(/https?:\/\/\S+/gi,"[url]")
    .replace(/\b[a-f0-9]{16,}\b/gi,"[opaque]")
    .replace(/\b\d{3,}\b/g,"[number]")
    .replace(/\b[a-z0-9-]+\.(?:com|net|org|tr|de|fr|io)\b/gi,"[domain]")
    .replace(/\s+/g," ").slice(0,400);
  return createHash("sha256").update(redacted).digest("hex").slice(0,12);
}
async function fetchPages(model,where,select,max=16000){
  const rows=[];let cursor;let reachedEnd=false;
  while(rows.length<max){
    const take=Math.min(400,max-rows.length);
    const batch=await model.findMany({where,select,orderBy:{id:"asc"},take,
      ...(cursor?{cursor:{id:cursor},skip:1}:{})});
    if(!batch.length){reachedEnd=true;break;}
    rows.push(...batch);cursor=batch.at(-1).id;
    if(batch.length<take){reachedEnd=true;break;}
  }
  return {rows,truncated:!reachedEnd};
}
try{
  const triggers=await db.messageTrigger.findMany({where:{event:"DONATION_LAPSED",channel:"EMAIL"},select:{templateId:true}});
  const ids=[...new Set(triggers.map(t=>t.templateId))];
  if(!ids.length){console.log(JSON.stringify({status:"NO_LAPSED_EMAIL_TRIGGER",readOnly:true}));process.exit(0);}
  const selected=await fetchPages(db.communicationDelivery,{
    origin:"TRIGGER",channel:"EMAIL",templateId:{in:ids},createdAt:{gte:start,lt:end}
  },{id:true,createdAt:true,status:true,providerMessageId:true,variables:true});
  const matching=selected.rows.filter(r=>r.variables?.trigger?.event==="DONATION_LAPSED");
  const byProvider=new Map(matching.filter(r=>r.providerMessageId).map(r=>[r.providerMessageId,r]));
  const allIds=[...byProvider.keys()];
  const byEvent={},causesByEvent={},failureSignatures={},nov8Minute={},statusByDay={};
  const failures=new Set();
  for(const row of matching){
    const day=row.createdAt.toISOString().slice(0,10);
    tally(statusByDay,day+"/"+row.status);
    if(day==="2026-11-08")tally(nov8Minute,row.createdAt.toISOString().slice(11,16)+" UTC");
    if(["FAILED","BOUNCED"].includes(row.status) && row.providerMessageId)failures.add(row.providerMessageId);
  }
  let eventsCount=0;
  const seenFailedMessageIds=new Set();
  const cap=30000;
  for(let offset=0;offset<allIds.length;offset+=150){
    const fetched=await fetchPages(db.communicationProviderEvent,{
      channel:"EMAIL",providerMessageId:{in:allIds.slice(offset,offset+150)}
    },{id:true,providerMessageId:true,eventType:true,status:true,errorMessage:true},Math.min(8000,cap-eventsCount));
    for(const e of fetched.rows){
      eventsCount++;
      const kind=safeType(e.eventType);
      tally(byEvent,kind+"/"+String(e.status||"UNKNOWN").toUpperCase());
      if(failures.has(e.providerMessageId)&&["FAILED","BOUNCED"].includes(e.status)){
        seenFailedMessageIds.add(e.providerMessageId);
        const cause=classify(e.errorMessage);
        tally(causesByEvent,kind+"/"+cause);
        tally(failureSignatures,kind+"/"+safeSignature(e.errorMessage));
      }
    }
    if(eventsCount>=cap)break;
  }
  const audit=await db.auditLog.findMany({
    where:{action:"DONATION_LAPSED_REMINDERS_RUN",createdAt:{gte:new Date("2026-11-08T00:00:00Z"),lt:end}},
    orderBy:{createdAt:"asc"},take:20,select:{createdAt:true,metadata:true}
  });
  const finishedAt=audit.map(x=>x.createdAt.toISOString());
  const cutoffs=audit.map(x=>x.createdAt);
  const beforeAfter=cutoffs.length===1?{
    beforeOrAtLoggedCompletion:matching.filter(r=>r.createdAt.toISOString().startsWith("2026-11-08")&&r.createdAt<=cutoffs[0]).length,
    afterLoggedCompletion:matching.filter(r=>r.createdAt.toISOString().startsWith("2026-11-08")&&r.createdAt>cutoffs[0]).length,
  }:null;
  const auditSummary=audit.map(a=>({
    finishedAtUTC:a.createdAt.toISOString(),
    recordedEmailSent:Array.isArray(a.metadata?.byTrigger)
      ?a.metadata.byTrigger.filter(t=>t.channel==="EMAIL").reduce((s,x)=>s+(Number(x.sent)||0),0):null,
    recordedTotalSent:Number(a.metadata?.sent??0)
  }));
  console.log(JSON.stringify({
    dateRangeUTC:[start.toISOString(),end.toISOString()],
    readOnly:true,providerRequests:0,messagesSent:0,dbWrites:0,
    lapsedEmailDeliveries:matching.length,deliveriesTruncated:selected.truncated,
    statusByDay:top(statusByDay),
    nov8ByMinuteUTC:top(nov8Minute,80),
    cronAuditRunsOnNov8:auditSummary,
    createdRelativeToSoleAudit:beforeAfter,
    providerEventRowsRead:eventsCount,
    failedMessagesWithExplicitFailedProviderEvent:seenFailedMessageIds.size,
    providerEventStatus:top(byEvent),
    providerFailureReasons:top(causesByEvent),
    recurrentFailedErrorFingerprints:top(failureSignatures,15).filter(x=>x.count>=3),
    note:"All descriptions are heuristic fixed-category matches, not raw provider errors. Error fingerprints are redacted and one-way; no recipient, contact, message identifier or full text is returned."
  },null,2));
}catch(e){
  console.error(JSON.stringify({status:"READ_ONLY_DIAGNOSIS_FAILED",readOnly:true,providerRequests:0,messagesSent:0,dbWrites:0}));
  process.exitCode=1;
}finally{await db.$disconnect().catch(()=>{});}
