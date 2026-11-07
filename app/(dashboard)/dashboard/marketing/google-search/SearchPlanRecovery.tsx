"use client";
import { useRef, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import { EditorModal } from "@/components/dashboard/content-editor/EditorModal";

type PlanScope = {id:string;version:number;status:string;request:{dailyBudget:number};resources?:{campaigns?:string[]}|null};
type ProviderReview = {currency:string;providerDailyBudget:number;missingResources:string[];campaigns:{resource:string;name:string;status:string;dailyBudget:number}[]};
const labels:Record<string,string> = {"restore-keywords":"إعادة تفعيل الكلمات الموقوفة تلقائيًا","adopt-provider-budget":"اعتماد ميزانية Google الحالية","discard-partial":"إزالة الإنشاء الجزئي والعودة للمسودة","adopt-existing":"اعتماد الحملات الموجودة فقط",detach:"إيقاف الحملات وفصل الخطة",archive:"أرشفة المسودة"};
const confirmations:Record<string,string> = {"restore-keywords":"RESTORE_AUTOMATION_KEYWORDS","adopt-provider-budget":"ADOPT_PROVIDER_BUDGET","discard-partial":"REMOVE_PARTIAL_CAMPAIGNS","adopt-existing":"ADOPT_EXISTING_CAMPAIGNS",detach:"DETACH_PLAN",archive:"ARCHIVE_PLAN"};
const button="rounded-lg border px-3 py-2.5 text-sm font-semibold disabled:opacity-40";
async function read(url:string,body?:unknown) {
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(60_000),...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw new Error(data.uncertain?"OUTCOME_UNCERTAIN":data.error||"SEARCH_OPERATION_FAILED");return data;
}
export function SearchPlanRecovery<T extends PlanScope>({plan,disabled,onUpdated,onStopInitiated}:{plan:T;disabled:boolean;onUpdated:(plan:T)=>void;onStopInitiated?:()=>void}) {
 const intent=useRef(0);
 const [stopApproved,setStopApproved]=useState(false),[stopping,setStopping]=useState(false),[working,setWorking]=useState(""),[error,setError]=useState("");
 const [action,setAction]=useState(""),[approved,setApproved]=useState(false),[review,setReview]=useState<ProviderReview|null>(null);
 const hasResources=Boolean(plan.resources?.campaigns?.length)||(disabled&&["DRAFT","VALIDATED"].includes(plan.status))||["ACTIVE","PAUSED","MIXED","CREATING","CHANGING","RECONCILE_REQUIRED","PARTIAL_PROVIDER_STATE","PAUSING"].includes(plan.status);
 const recovery=["RECONCILE_REQUIRED","PARTIAL_PROVIDER_STATE","PAUSED","ACTIVE","MIXED"].includes(plan.status);
 async function stop() {
  if(!stopApproved||stopping)return;intent.current++;setAction("");setWorking("");onStopInitiated?.();setStopping(true);setError("");
  try {const data=await read("/api/admin/google-search",{id:plan.id,version:plan.version,action:"pause"});onUpdated(data.plan);setStopApproved(false);}
  catch {setError(dt("عُطلت المتابعة محليًا إن أمكن حفظ الطلب، لكن إيقاف Google لم يتأكد. راجع الحملات والمطابقة قبل إعادة التفعيل."));}
  finally {setStopping(false);}
 }
 async function open(next:string) {
  const epoch=++intent.current;setError("");setApproved(false);setReview(null);setAction(next);
  if(["adopt-provider-budget","adopt-existing"].includes(next)) {
   setWorking("review");try {const data=await read(`/api/admin/google-search?id=${plan.id}&providerReview=1`);if(epoch===intent.current)setReview(data.review);}
   catch {if(epoch===intent.current)setError(dt("تعذر قراءة ميزانية Google الحالية؛ لم يُعتمد أي تغيير."));}finally{if(epoch===intent.current)setWorking("");}
  }
 }
 async function execute() {
  if(!approved||working||!action)return;const epoch=intent.current;setWorking(action);setError("");
  try {
   const data=await read("/api/admin/google-search",{id:plan.id,version:plan.version,action,confirmation:confirmations[action],...(review?{newDailyBudget:review.providerDailyBudget,currency:review.currency}:{})});
   if(epoch!==intent.current)return;onUpdated(data.plan);setAction("");setApproved(false);
  }catch {if(epoch===intent.current)setError(dt("لم يتأكد تنفيذ الإجراء. حدّث الخطة واستخدم المطابقة قبل إعادة المحاولة."));}finally{if(epoch===intent.current)setWorking("");}
 }
 return <section aria-label={dt("الإيقاف واستعادة الخطة")} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
  <h3 className="font-bold">{dt("الإيقاف واستعادة الخطة")}</h3>
  {hasResources?<div className="space-y-3 rounded-xl border border-red-200 bg-white p-3">
   <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1" checked={stopApproved} disabled={stopping} onChange={e=>setStopApproved(e.target.checked)}/>{dt("أوافق على إيقاف عرض حملات هذه الخطة فورًا وتعطيل متابعتها التلقائية.")}</label>
   <button type="button" className={`${button} border-red-700 bg-red-700 text-white`} disabled={!stopApproved||stopping} onClick={stop}>{stopping?dt("جار الإيقاف والتحقق…"):dt("إيقاف فوري")}</button>
   <p className="text-xs leading-6 text-slate-600">{dt("يبقى الإيقاف متاحًا أثناء عمل طلب سابق. تظهر الحملات التي تعذر تأكيد إيقافها في نتيجة الخطة.")}</p>
  </div>:null}
  <div className="flex flex-wrap gap-2">
   {recovery?<><button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("restore-keywords")}>{dt(labels["restore-keywords"])}</button><button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("adopt-provider-budget")}>{dt(labels["adopt-provider-budget"])}</button></>:null}
   {plan.status==="PARTIAL_PROVIDER_STATE"?<><button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("adopt-existing")}>{dt(labels["adopt-existing"])}</button><button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("discard-partial")}>{dt(labels["discard-partial"])}</button></>:null}
   {["RECONCILE_REQUIRED","PARTIAL_PROVIDER_STATE"].includes(plan.status)?<button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("detach")}>{dt(labels.detach)}</button>:null}
   {["DRAFT","VALIDATED","PLANNING_FAILED"].includes(plan.status)?<button type="button" className={button} disabled={disabled||Boolean(working)||stopping} onClick={()=>open("archive")}>{dt(labels.archive)}</button>:null}
  </div>
  {error?<p role="alert" className="text-sm leading-6 text-red-800">{error}</p>:null}
  {action?<EditorModal title={dt(labels[action])} onClose={()=>setAction("")}><div className="w-full max-w-xl space-y-4 rounded-xl bg-white p-5">
   <h2 className="text-lg font-bold">{dt(labels[action])}</h2>
   {action==="discard-partial"?<p className="text-sm leading-7">{dt("ستُوقف وتُزال حملات هذه الخطة الموجودة في Google فقط، مع حفظ سجلها، ثم تعود الخطة لإمكانية الإنشاء من جديد.")}</p>:action==="restore-keywords"?<p className="text-sm leading-7">{dt("تُستعاد الكلمات المسجلة في تاريخ الإيقاف التلقائي لهذه الخطة فقط، بعد فحص Google والتحقق من النتيجة.")}</p>:action==="detach"?<p className="text-sm leading-7">{dt("سيُتحقق من إيقاف الحملات المتبقية أولًا، ثم تُفصل الخطة عن المتابعة مع إبقاء سجلها.")}</p>:null}
   {["adopt-provider-budget","adopt-existing"].includes(action)?review?<div className="space-y-2 text-sm"><p>{dt("الميزانية المحفوظة")}: <b dir="ltr">{plan.request.dailyBudget} {review.currency}</b></p><p>{dt("ميزانية Google الحالية التي ستُعتمد")}: <b dir="ltr">{review.providerDailyBudget} {review.currency}</b></p>{review.campaigns.map(c=><p key={c.resource} className="rounded-lg border p-2" dir="auto">{c.name} · {c.dailyBudget} {review.currency} · {c.status}</p>)}{review.missingResources.length?<p className="text-amber-900">{dt("بعض موارد الخطة لم تعد موجودة في Google؛ اعتمد الموجود أو أوقف الخطة وافصلها.")}</p>:null}</div>:<p role="status" className="text-sm">{dt("جار قراءة الحالة من Google…")}</p>:null}
   <label className="flex items-start gap-2 text-sm leading-7"><input type="checkbox" className="mt-2" checked={approved} disabled={Boolean(working)} onChange={e=>setApproved(e.target.checked)}/>{dt("راجعت نطاق الإجراء وميزانيته ونتيجته وأوافق على تنفيذه.")}</label>
   <div className="flex gap-2"><button type="button" className={`${button} bg-brand text-white`} disabled={!approved||Boolean(working)||(["adopt-provider-budget","adopt-existing"].includes(action)&&!review)} onClick={execute}>{dt("اعتماد وتنفيذ")}</button><button type="button" className={button} onClick={()=>setAction("")}>{working?dt("العودة للإيقاف الطارئ"):dt("إلغاء")}</button></div>
  </div></EditorModal>:null}
 </section>;
}
