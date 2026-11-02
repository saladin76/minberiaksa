"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { dt, dashIntl } from "@/lib/dashboard/i18n";
import type { SiteNotification } from "@/lib/dashboard/site-notifications";
import { useLiveDonationRefresh } from "@/hooks/useLiveDonationRefresh";

type Item=SiteNotification & {read:boolean};
export default function SiteNotificationsPage() {
  const [items,setItems]=useState<Item[]>([]),[unread,setUnread]=useState(0),[next,setNext]=useState<string|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
  const load=useCallback(async (before?:string)=>{
    setBusy(true);setError("");setHistoryOpen(Boolean(before));
    try {const res=await fetch(`/api/admin/site-notifications${before?`?before=${encodeURIComponent(before)}`:""}`,{cache:"no-store"});const body=await res.json();if(!res.ok)throw Error();setItems(previous=>before?[...previous,...body.items.filter((item:Item)=>!previous.some(row=>row.id===item.id))]:body.items);setUnread(body.unread);setNext(body.nextBefore);}
    catch{setError(dt("تعذّر تحميل إشعارات الموقع"));}finally{setBusy(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  useLiveDonationRefresh(()=>load(),!busy&&!historyOpen);
  const markRead=async()=>{setBusy(true);try{const res=await fetch("/api/admin/site-notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"MARK_ALL_READ"})});if(!res.ok)throw Error();window.dispatchEvent(new Event("site-notifications-read"));await load();}catch{setError(dt("تعذّر تحديث حالة القراءة"));}finally{setBusy(false);}};
  return <div className="space-y-5"><PageHeader title={dt("إشعارات الموقع")} description={dt("أحداث المتبرعين والمدفوعات والاشتراكات داخل الموقع.")} icon={Bell} actions={<div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw className="me-1 size-4"/>{dt("تحديث")}</Button><Button disabled={busy||!unread} onClick={()=>void markRead()}><CheckCheck className="me-1 size-4"/>{dt("تحديد الكل كمقروء")}</Button></div>}/>
    <p className="text-sm text-slate-600">{dt("غير مقروءة")}: {unread}</p>
    {error?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>:null}
    <div className="divide-y overflow-hidden rounded-xl border bg-white">{items.map(item=><article key={item.id} className={`flex gap-3 p-4 ${item.read?"":"bg-amber-50/50"}`}><Bell className={`mt-1 size-4 shrink-0 ${item.read?"text-slate-300":"text-brand"}`}/><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{item.href?<Link href={item.href} className="hover:underline">{dt(item.title)}</Link>:dt(item.title)}</h2><p className="mt-1 break-words text-sm text-slate-600">{item.message}</p><time dateTime={item.at} className="mt-2 block text-xs text-slate-400">{new Intl.DateTimeFormat(dashIntl("ar-EG"),{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(new Date(item.at))}</time></div></article>)}{!items.length&&!busy?<p className="p-10 text-center text-sm text-slate-500">{dt("لا توجد إشعارات بعد")}</p>:null}</div>
    {next?<Button variant="outline" disabled={busy} onClick={()=>void load(next)}>{dt("عرض المزيد")}</Button>:null}
  </div>;
}
