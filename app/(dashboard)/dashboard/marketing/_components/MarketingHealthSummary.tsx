"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Health = {
  scores?: { readiness: number; delivery: number; overall: number };
  donations?: { paidLast7d: number; missingServerConversions: number };
  conversionEvents?: { failedLast7d: number };
  sync?: { meta?: { status?: string | null; rowsFetched?: number | null; error?: string | null } | null };
};

function tone(value: number) {
  if (value >= 80) return "text-emerald-700";
  if (value >= 50) return "text-amber-700";
  return "text-rose-700";
}

function syncLabel(status?: string | null) {
  if (!status) return "غير متاح";
  if (status === "SUCCESS") return "ناجح";
  if (status === "PARTIAL_SUCCESS") return "جزئي";
  if (status === "FAILED") return "فشل";
  if (status === "MISSING_CONFIG") return "إعداد ناقص";
  if (status === "NOT_IMPLEMENTED") return "غير مفعّل";
  return status;
}

export function MarketingHealthSummary() {
  const [data, setData] = React.useState<Health | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/marketing-intelligence/health", { cache: "no-store" });
      const json = await res.json().catch(() => null) as Health | null;
      if (!res.ok || !json?.scores) throw new Error("failed");
      setData(json);
    } catch {
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, []);

  const scores = data?.scores;
  const hasProblems = Boolean((data?.donations?.missingServerConversions ?? 0) > 0 || (data?.conversionEvents?.failedLast7d ?? 0) > 0 || data?.sync?.meta?.error);

  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
      <div>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand" />صحة التسويق السريعة</CardTitle>
        <CardDescription>ملخص من Health API بدون تغيير التتبع أو الدفع.</CardDescription>
      </div>
      <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث
      </Button>
    </CardHeader>
    <CardContent>
      {loading ? <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div> : error || !scores ? <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">تعذر تحميل ملخص الصحة الآن. افتح صفحة جودة التتبع للتفاصيل.</div> : <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Mini label="الصحة العامة" value={`${scores.overall}%`} className={tone(scores.overall)} />
          <Mini label="جاهزية الربط" value={`${scores.readiness}%`} className={tone(scores.readiness)} />
          <Mini label="تسليم التحويلات" value={`${scores.delivery}%`} className={tone(scores.delivery)} />
          <Mini label="Meta Sync" value={syncLabel(data?.sync?.meta?.status)} className={data?.sync?.meta?.error ? "text-rose-700" : "text-slate-900"} />
        </div>
        <div className={`rounded-xl border p-4 text-sm ${hasProblems ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <div className="flex items-center gap-2 font-bold">{hasProblems ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{hasProblems ? "يوجد ما يحتاج مراجعة" : "لا توجد مشكلة حرجة ظاهرة"}</div>
          <div className="mt-2 leading-6">تحويلات ناقصة: {data?.donations?.missingServerConversions ?? 0} • أحداث فاشلة: {data?.conversionEvents?.failedLast7d ?? 0}</div>
          <Link href="/dashboard/marketing/quality" className="mt-3 inline-flex rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50">فتح جودة التتبع</Link>
        </div>
      </div>}
    </CardContent>
  </Card>;
}

function Mini({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className="rounded-xl border bg-slate-50 p-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-black ${className || "text-slate-900"}`}>{value}</div>
  </div>;
}
