"use client";

import * as React from "react";
import { CalendarDays, Database, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarketingPageHeader } from "../_components/MarketingPageHeader";

type PlatformKey = "all" | "meta" | "google_ads" | "ga4" | "tiktok" | "twilio";
type PeriodKey = "today" | "7" | "14" | "30" | "custom";
type SyncResult = { platform?: string; status?: string; rowsFetched?: number; missingRequiredFields?: string[]; message?: string | null; error?: string | null };
type SyncResponse = { ok?: boolean; status?: string; results?: SyncResult[]; error?: string };

const periods: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: "today", label: "اليوم", days: 1 },
  { key: "7", label: "7 أيام", days: 7 },
  { key: "14", label: "14 يوم", days: 14 },
  { key: "30", label: "30 يوم", days: 30 },
  { key: "custom", label: "Custom", days: null },
];

const platforms: { key: PlatformKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "meta", label: "Meta" },
  { key: "google_ads", label: "Google" },
  { key: "ga4", label: "GA4" },
  { key: "tiktok", label: "TikTok" },
  { key: "twilio", label: "WhatsApp" },
];

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function rangeFromPeriod(period: PeriodKey, customFrom: string, customTo: string) {
  if (period === "custom") return { dateFrom: customFrom, dateTo: customTo };
  const days = periods.find((item) => item.key === period)?.days ?? 7;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { dateFrom: dateKey(from), dateTo: dateKey(to) };
}
function statusLabel(status?: string) {
  if (status === "success" || status === "SUCCESS") return "ناجح";
  if (status === "partial_success" || status === "PARTIAL_SUCCESS") return "جزئي";
  if (status === "failed" || status === "FAILED") return "فشل";
  if (status === "missing_config" || status === "MISSING_CONFIG") return "إعداد ناقص";
  if (status === "not_implemented" || status === "NOT_IMPLEMENTED") return "غير مفعّل";
  if (status === "skipped" || status === "SKIPPED") return "تم التخطي";
  return status || "غير معروف";
}
function statusClass(status?: string) {
  if (status === "success" || status === "SUCCESS" || status === "partial_success" || status === "PARTIAL_SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed" || status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function MarketingDataSyncPage() {
  const [period, setPeriod] = React.useState<PeriodKey>("7");
  const [customFrom, setCustomFrom] = React.useState(dateKey(new Date()));
  const [customTo, setCustomTo] = React.useState(dateKey(new Date()));
  const [platform, setPlatform] = React.useState<PlatformKey>("all");
  const [syncing, setSyncing] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<SyncResponse | null>(null);
  const range = rangeFromPeriod(period, customFrom, customTo);

  async function runSync() {
    if (!range.dateFrom || !range.dateTo) return toast.error("اختر تاريخ البداية والنهاية");
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/marketing/data-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, dateFrom: range.dateFrom, dateTo: range.dateTo }),
      });
      const json = await res.json().catch(() => null) as SyncResponse | null;
      if (!res.ok || !json) throw new Error(json?.error || "sync failed");
      setLastResult(json);
      const label = statusLabel(json.status);
      if (json.ok) toast.success(`تم سحب البيانات: ${label}`);
      else toast(`نتيجة السحب: ${label}`, { icon: "ℹ️" });
    } catch {
      toast.error("تعذر تشغيل سحب البيانات");
    } finally {
      setSyncing(false);
    }
  }

  const rows = lastResult?.results ?? [];

  return <div className="space-y-5 p-4 sm:p-6" dir="rtl">
    <MarketingPageHeader
      title="سحب البيانات"
      description="شاشة تشغيل فقط: اختر الفترة والمنصة ثم اسحب النتائج. تظهر التفاصيل الفنية فقط عند وجود خطأ أو حقول ناقصة."
    />

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand" />تشغيل المزامنة</CardTitle><CardDescription>كل شيء في خطوة واحدة.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2"><div className="text-sm font-bold text-slate-800">الفترة</div><div className="flex flex-wrap gap-2">{periods.map((item) => <Button key={item.key} variant={period === item.key ? "default" : "outline"} onClick={() => setPeriod(item.key)}>{item.label}</Button>)}</div></div>
          <div className="space-y-2"><div className="text-sm font-bold text-slate-800">المنصة</div><div className="flex flex-wrap gap-2">{platforms.map((item) => <Button key={item.key} variant={platform === item.key ? "default" : "outline"} onClick={() => setPlatform(item.key)}>{item.label}</Button>)}</div></div>
          <div className="flex items-end"><Button onClick={runSync} disabled={syncing} className="min-w-40 gap-2">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}سحب الآن</Button></div>
        </div>
        {period === "custom" ? <div className="grid gap-3 md:grid-cols-2"><div><label className="mb-1 block text-xs text-slate-500">من تاريخ</label><Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></div><div><label className="mb-1 block text-xs text-slate-500">إلى تاريخ</label><Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></div></div> : null}
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">الفترة الحالية: <b>{range.dateFrom}</b> إلى <b>{range.dateTo}</b></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>نتيجة آخر تشغيل</CardTitle><CardDescription>مختصر فقط. التفاصيل الفنية تظهر عند وجود خطأ.</CardDescription></CardHeader>
      <CardContent>
        {!lastResult ? <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">لم يتم تشغيل سحب بيانات بعد.</div> : <div className="space-y-3">
          <div className={`inline-flex rounded-full border px-3 py-1 text-sm ${statusClass(lastResult.status)}`}>الحالة: {statusLabel(lastResult.status)}</div>
          <div className="grid gap-3 md:grid-cols-3"><Mini label="المنصات" value={String(rows.length)} /><Mini label="الصفوف" value={String(rows.reduce((sum, row) => sum + (row.rowsFetched ?? 0), 0))} /><Mini label="أخطاء" value={String(rows.filter((row) => row.error || row.missingRequiredFields?.length).length)} /></div>
          {rows.length ? <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer list-none text-sm font-bold text-slate-900">عرض تفاصيل آخر تشغيل</summary><div className="mt-3 space-y-2">{rows.map((row, index) => <div key={`${row.platform}-${index}`} className="rounded-xl border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{row.platform || "منصة"}</b><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></div><div className="mt-1 text-xs text-slate-500">الصفوف: {row.rowsFetched ?? 0}</div>{row.missingRequiredFields?.length ? <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">حقول ناقصة: {row.missingRequiredFields.join(", ")}</div> : null}{row.error ? <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{row.error}</div> : null}</div>)}</div></details> : null}
        </div>}
      </CardContent>
    </Card>
  </div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-black text-slate-950">{value}</div></div>;
}
