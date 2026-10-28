"use client";
import { useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
export function InboxMedia({conversationId,itemId,media}:{conversationId:string;itemId:string;media:{kind:string;filename:string|null;caption?:string|null}}){
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const src=`/api/dashboard/communication/inbox/${encodeURIComponent(conversationId)}/media/${encodeURIComponent(itemId)}?retry=${retry}`;
 if(failed)return <div className="my-2 rounded-lg border p-3 text-xs"><p>{dt("تعذر تحميل المرفق. أعد المحاولة أو اطلب إعادة إرساله.")}</p><button type="button" className="mt-2 underline" onClick={()=>{setFailed(false);setRetry(x=>x+1);}}>{dt("إعادة المحاولة")}</button></div>;
 return <div className="my-2 max-w-full space-y-2">
  {["image","sticker"].includes(media.kind)?
   // eslint-disable-next-line @next/next/no-img-element -- authenticated archive media cannot use an image optimizer cache
   <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={media.caption||dt("صورة مرفقة")} className="max-h-80 max-w-full rounded-xl object-contain" loading="lazy" onError={()=>setFailed(true)}/></a>
  :media.kind==="audio"?<audio key={src} src={src} controls preload="none" className="max-w-full" aria-label={dt("تشغيل الرسالة الصوتية")} onError={()=>setFailed(true)}/>
  :media.kind==="video"?<video key={src} src={src} controls preload="metadata" className="max-h-80 max-w-full rounded-xl" aria-label={dt("تشغيل المقطع المرئي")} onError={()=>setFailed(true)}/>
  :<a href={src} download={media.filename||"attachment"} className="inline-block break-all rounded-lg border bg-white/70 p-3 text-sm underline">{media.filename||dt("تنزيل المرفق")}</a>}
 </div>;
}
