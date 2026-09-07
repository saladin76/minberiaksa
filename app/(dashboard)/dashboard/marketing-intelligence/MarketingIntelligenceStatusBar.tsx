"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

type Run = { status?: string | null; startedAt?: string | null; finishedAt?: string | null; rowsFetched?: number | null; error?: string | null };
type Payload = { ok?: boolean; latest?: Run | null; lastSuccess?: Run | null };

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}

function cls(status?: string | null) {
  if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function shouldHideStatusBar(pathname: string) {
  return pathname === "/dashboard/marketing-intelligence" || pathname === "/dashboard/marketing-intelligence/ads-recommendations";
}

export function MarketingIntelligenceStatusBar() {
  const pathname = usePathname();
  const hideStatusBar = shouldHideStatusBar(pathname);
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (hideStatusBar) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/marketing-intelligence/sync-status?platform=META", { cache: "no-store" });
      const json = await res.json().catch(() => null) as Payload | null;
      setData(json?.ok ? json : null);
    } finally {
      setLoading(false);
    }
  }, [hideStatusBar]);

  React.useEffect(() => { void load(); }, [load]);
  if (hideStatusBar) return null;

  const latest = data?.latest ?? null;
  const success = data?.lastSuccess ?? null;
  return <div className="border-b bg-white px-4 py-3 sm:px-6" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-900">مزامنة Meta</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${cls(latest?.status)}`}>{latest?.status ?? "لا توجد"}</span>
        <span className="text-slate-500">آخر تشغيل: {fmt(latest?.startedAt)}</span>
        <span className="text-slate-500">آخر نجاح: {fmt(success?.finishedAt ?? success?.startedAt)}</span>
        <span className="text-slate-500">السجلات: {latest?.rowsFetched ?? 0}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />تحديث الحالة</button>
        <Link href="/dashboard/marketing-intelligence/campaign-links" className="rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">أداء روابط الحملات</Link>
        <Link href="/dashboard/marketing-intelligence/campaign-links/health" className="rounded-md border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">صحة روابط الحملات</Link>
      </div>
    </div>
  </div>;
}
