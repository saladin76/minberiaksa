"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Square, X } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";
import { inboxMediaSpec } from "@/lib/communication/inbox-media";
export type InboxAttachment = {file:File;voice:boolean};
export function InboxAttachments({attachment,onChange,disabled,onError,onRecordingChange}:{attachment?:InboxAttachment;onChange:(value:InboxAttachment|null)=>void;disabled:boolean;onError:(message:string)=>void;onRecordingChange:(value:boolean)=>void}){
 const input=useRef<HTMLInputElement>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [recording,setRecording]=useState(false),[requesting,setRequesting]=useState(false),[seconds,setSeconds]=useState(0),[url,setUrl]=useState("");
 const mounted=useRef(true);
 useEffect(()=>{onRecordingChange(recording||requesting);},[recording,requesting,onRecordingChange]);
 useEffect(()=>()=>onRecordingChange(false),[onRecordingChange]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());if(stopTimer.current)clearTimeout(stopTimer.current);};},[]);
 useEffect(()=>{if(!attachment){setUrl("");return;}const value=URL.createObjectURL(attachment.file);setUrl(value);return()=>URL.revokeObjectURL(value);},[attachment]);
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(value=>value+1),1000);return()=>clearInterval(timer);},[recording]);
 const accept=(file:File,voice=false)=>{if(!inboxMediaSpec(file.type,file.size,voice)){onError(dt("نوع الملف أو حجمه غير مدعوم. الصور حتى 5 MB، الصوت والفيديو حتى 16 MB، والمستندات حتى 100 MB."));return;}onChange({file,voice});};
 const stop=()=>{if(recorder.current?.state==="recording")recorder.current.stop();};
 const start=async()=>{
  if(disabled||requesting||recording)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){onError(dt("التسجيل غير متاح في هذا المتصفح. يمكنك إرفاق ملف صوتي بدلًا منه."));return;}
  setRequesting(true);
  try{
   const audio=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!mounted.current){audio.getTracks().forEach(track=>track.stop());return;}
   stream.current=audio;
   const mime=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
   const device=new MediaRecorder(audio,mime?{mimeType:mime}:undefined),chunks:BlobPart[]=[];recorder.current=device;
   device.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   device.onstop=()=>{audio.getTracks().forEach(track=>track.stop());stream.current=null;if(stopTimer.current)clearTimeout(stopTimer.current);if(mounted.current)setRecording(false);const blob=new Blob(chunks,{type:device.mimeType||mime||"audio/webm"});if(blob.size)accept(new File([blob],"recording.webm",{type:blob.type}),true);};
   device.onerror=()=>{audio.getTracks().forEach(track=>track.stop());if(mounted.current){setRecording(false);onError(dt("تعذر تسجيل الصوت. تحقق من الميكروفون وأعد المحاولة."));}};
   setSeconds(0);device.start(1000);setRecording(true);stopTimer.current=setTimeout(stop,300000);
  }catch{if(mounted.current)onError(dt("تعذر الوصول إلى الميكروفون. اسمح باستخدامه ثم أعد المحاولة."));}
  finally{if(mounted.current)setRequesting(false);}
 };
 return <div className="space-y-2">
  <div className="flex flex-wrap items-center gap-2"><input ref={input} type="file" className="hidden" aria-label={dt("اختيار مرفق للمحادثة")} accept="image/jpeg,image/png,video/mp4,video/3gpp,audio/aac,audio/amr,audio/mpeg,audio/mp4,audio/ogg,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={event=>{const file=event.target.files?.[0];if(file)accept(file);event.target.value="";}}/>
   <button type="button" disabled={disabled||recording||requesting} onClick={()=>input.current?.click()} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs disabled:opacity-40"><Paperclip size={16}/>{dt("إرفاق ملف")}</button>
   <button type="button" disabled={disabled||requesting} onClick={()=>recording?stop():void start()} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs disabled:opacity-40">{recording?<Square size={16} className="text-red-600"/>:<Mic size={16}/>}{recording?dt("إيقاف التسجيل"):requesting?dt("جار طلب الميكروفون…"):dt("تسجيل رسالة صوتية")}</button>
   {recording?<span role="status" className="text-xs text-red-700"><bdi>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</bdi> · {dt("الحد الأقصى للتسجيل 5 دقائق")}</span>:null}
  </div>
  {attachment?<div className="flex min-w-0 items-start gap-3 rounded-xl border bg-slate-50 p-3"><div className="min-w-0 flex-1"><p className="break-all text-xs font-medium">{attachment.voice?dt("رسالة صوتية جاهزة للإرسال"):attachment.file.name}</p><p className="mt-1 text-xs text-slate-500"><bdi>{(attachment.file.size/1024/1024).toFixed(2)} MB</bdi></p>
   {url && attachment.file.type.startsWith("image/")?
    // eslint-disable-next-line @next/next/no-img-element -- temporary local attachment preview
    <img src={url} alt={dt("معاينة المرفق")} className="mt-2 max-h-36 max-w-full rounded-lg"/>
   :url && (attachment.voice||attachment.file.type.startsWith("audio/"))?<audio src={url} controls className="mt-2 max-w-full" aria-label={dt("معاينة التسجيل الصوتي")}/>:null}
   {attachment.voice||attachment.file.type.startsWith("audio/")?<p className="mt-2 text-xs text-slate-500">{dt("يُرسل الصوت وحده، ويبقى أي نص كتبته في المسودة.")}</p>:null}
  </div><button type="button" aria-label={dt("إزالة المرفق")} disabled={disabled} onClick={()=>onChange(null)} className="rounded border bg-white p-1.5"><X size={16}/></button></div>:null}
 </div>;
}
