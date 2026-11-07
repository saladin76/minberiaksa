"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";
import { useLiveDonationRefresh } from "@/hooks/useLiveDonationRefresh";
export function SiteNotificationBell() {
  const [unread,setUnread]=useState(0);
  const refresh=useCallback(async()=>{try{const response=await fetch("/api/admin/site-notifications?countOnly=1",{cache:"no-store"});if(response.ok)setUnread((await response.json()).unread||0);}catch{}},[]);
  useEffect(()=>{void refresh();window.addEventListener("site-notifications-read",refresh);return()=>window.removeEventListener("site-notifications-read",refresh);},[refresh]);
  useLiveDonationRefresh(refresh,true);
  return <Link href="/dashboard/notifications" aria-label={unread > 0 ? dt("إشعارات الموقع، {0} غير مقروءة", [unread]) : dt("إشعارات الموقع")} className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand"><Bell size={18}/>{unread>0?<span className="absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white ring-2 ring-white">{unread>99?"99+":unread}</span>:null}</Link>;
}
