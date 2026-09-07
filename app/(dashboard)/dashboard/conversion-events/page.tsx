"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Loader2, RefreshCw, Search } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ConversionEventRow = {
  _id?: { $oid?: string } | string;
  eventId?: string;
  eventName?: string;
  platform?: string;
  channel?: string;
  status?: string;
  donationId?: string;
  value?: number;
  currency?: string;
  attempts?: number;
  error?: string | null;
  createdAt?: string | { $date?: string };
  sentAt?: string | { $date?: string } | null;
};

type ApiResponse = {
  ok: boolean;
  source?: "ConversionEvent" | "auditLogFallback" | string;
  total: number;
  rawTotal?: number;
  events: ConversionEventRow[];
};

type DonationTimeline = {
  key: string;
  donationId: string;
  events: ConversionEventRow[];
  statuses: Record<string, number>;
  platforms: string[];
  latestAt: number;
  amountLabel: string;
  canRetry: boolean;
};

function rawDate(value: ConversionEventRow["createdAt"] | ConversionEventRow["sentAt"]) {
  if (!value) return null;
  const raw = typeof value === "string" ? value : value.$date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function renderDate(value: ConversionEventRow["createdAt"]) {
  const d = rawDate(value);
  if (!d) return "—";
  return d.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}

function rowKey(row: ConversionEventRow, index: number) {
  if (typeof row._id === "string") return row._id;
  return row._id?.$oid ?? row.eventId ?? String(index);
}

function sourceLabel(source: string | null) {
  if (source === "ConversionEvent") return "المصدر الأساسي: ConversionEvent";
  if (source === "auditLogFallback") return "المصدر الاحتياطي: auditLog";
  return "المصدر: غير محدد";
}

function statusLabel(status?: string) {
  if (status === "SENT") return "تم الإرسال";
  if (status === "FAILED") return "فشل";
  if (status === "SKIPPED") return "تم التخطي";
  if (status === "PENDING") return "قيد الانتظار";
  return status || "غير محدد";
}

function statusClass(status?: string) {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "SKIPPED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "PENDING") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function moneyLabel(row: ConversionEventRow) {
  if (typeof row.value !== "number") return "—";
  return `${row.value} ${row.currency ?? ""}`.trim();
}

function timelineHref(donationId: string) {
  return `/dashboard/conversion-events/timeline?donationId=${encodeURIComponent(donationId)}`;
}

function groupByDonation(events: ConversionEventRow[]): DonationTimeline[] {
  const groups = new Map<string, ConversionEventRow[]>();
  events.forEach((event, index) => {
    const key = event.donationId?.trim() || `بدون تبرع #${index + 1}`;
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
  });

  return [...groups.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => (rawDate(a.createdAt)?.getTime() ?? 0) - (rawDate(b.createdAt)?.getTime() ?? 0));
    const statuses: Record<string, number> = {};
    const platforms = new Set<string>();
    let latestAt = 0;
    let amountLabel = "—";

    for (const row of sorted) {
      const status = row.status || "UNKNOWN";
      statuses[status] = (statuses[status] || 0) + 1;
      if (row.platform) platforms.add(row.platform);
      latestAt = Math.max(latestAt, rawDate(row.createdAt)?.getTime() ?? 0, rawDate(row.sentAt)?.getTime() ?? 0);
      if (amountLabel === "—" && typeof row.value === "number") amountLabel = moneyLabel(row);
    }

    return {
      key,
      donationId: key.startsWith("بدون تبرع") ? "—" : key,
      events: sorted,
      statuses,
      platforms: [...platforms].sort(),
      latestAt,
      amountLabel,
      canRetry: !key.startsWith("بدون تبرع") && sorted.some((event) => event.channel === "server" && event.status !== "SENT"),
    };
  }).sort((a, b) => b.latestAt - a.latestAt);
}

function statusSummary(statuses: Record<string, number>) {
  const order = ["SENT", "FAILED", "SKIPPED", "PENDING", "UNKNOWN"];
  return order.filter((s) => statuses[s]).map((s) => `${statusLabel(s)}: ${statuses[s]}`).join(" · ") || "—";
}

export default function ConversionEventsPage() {
  const [events, setEvents] = React.useState<ConversionEventRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [rawTotal, setRawTotal] = React.useState(0);
  const [source, setSource] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [platform, setPlatform] = React.useState("all");
  const [channel, setChannel] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [days, setDays] = React.useState("7");
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"timeline" | "table">("timeline");
  const [retryingDonationId, setRetryingDonationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") || params.get("donationId") || "";
    if (query) setQ(query);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ platform, channel, status, days, limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/conversion-events?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !data?.ok) throw new Error("failed");
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setRawTotal(data.rawTotal || data.total || 0);
      setSource(data.source || null);
    } catch {
      toast.error("تعذر تحميل أحداث التحويل");
      setEvents([]);
      setTotal(0);
      setRawTotal(0);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [platform, channel, status, days, q]);

  React.useEffect(() => { void load(); }, [load]);

  async function retryDonation(donationId: string) {
    if (!donationId || donationId === "—") return;
    setRetryingDonationId(donationId);
    try {
      const res = await fetch("/api/admin/conversion-events/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { ok?: boolean; skipped?: boolean; reason?: string; error?: string } };
      if (!res.ok || data.ok === false) throw new Error(data.result?.error || "retry failed");
      if (data.result?.ok) toast.success("تمت إعادة إرسال التحويل بنجاح");
      else if (data.result?.skipped) toast(`تمت المحاولة لكن تم التخطي: ${data.result.reason ?? "غير محدد"}`);
      else toast.error(`فشلت إعادة المحاولة: ${data.result?.error ?? data.result?.reason ?? "غير محدد"}`);
      await load();
    } catch {
      toast.error("فشلت إعادة محاولة التحويل");
    } finally {
      setRetryingDonationId(null);
    }
  }

  const timelines = React.useMemo(() => groupByDonation(events), [events]);
  const statusCounts = React.useMemo(() => events.reduce<Record<string, number>>((acc, row) => {
    const key = row.status || "UNKNOWN";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}), [events]);

  return <div className="space-y-5 p-4 sm:p-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">أحداث التحويل</h1>
        <p className="mt-1 text-sm text-slate-500">سجل ConversionEvent الموحد لفحص إرسال التحويلات حسب المنصة والقناة والحالة، مع Timeline لكل تبرع.</p>
      </div>
      <Button onClick={load} variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" />تحديث</Button>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>الفلاتر</CardTitle>
        <CardDescription>اعرض آخر أحداث التحويل أو ابحث برقم التبرع أو event id أو الخطأ.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue placeholder="المنصة" /></SelectTrigger><SelectContent><SelectItem value="all">كل المنصات</SelectItem><SelectItem value="META">Meta</SelectItem><SelectItem value="GA4">GA4</SelectItem><SelectItem value="GOOGLE_ADS">Google Ads</SelectItem><SelectItem value="TIKTOK">TikTok</SelectItem><SelectItem value="X">X</SelectItem><SelectItem value="VERCEL">Vercel</SelectItem></SelectContent></Select>
        <Select value={channel} onValueChange={setChannel}><SelectTrigger><SelectValue placeholder="القناة" /></SelectTrigger><SelectContent><SelectItem value="all">كل القنوات</SelectItem><SelectItem value="server">Server</SelectItem><SelectItem value="browser">Browser</SelectItem></SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="SENT">SENT</SelectItem><SelectItem value="FAILED">FAILED</SelectItem><SelectItem value="SKIPPED">SKIPPED</SelectItem><SelectItem value="PENDING">PENDING</SelectItem></SelectContent></Select>
        <Select value={days} onValueChange={setDays}><SelectTrigger><SelectValue placeholder="الفترة" /></SelectTrigger><SelectContent><SelectItem value="1">آخر يوم</SelectItem><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوم</SelectItem><SelectItem value="90">آخر 90 يوم</SelectItem></SelectContent></Select>
        <Select value={view} onValueChange={(value) => setView(value as "timeline" | "table")}><SelectTrigger><SelectValue placeholder="العرض" /></SelectTrigger><SelectContent><SelectItem value="timeline">Timeline التبرع</SelectItem><SelectItem value="table">جدول فني</SelectItem></SelectContent></Select>
        <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="pr-9" /></div>
      </CardContent>
    </Card>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Card><CardContent className="p-4"><div className="text-xs text-slate-500">إجمالي الأحداث</div><div className="mt-1 text-2xl font-black">{total}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-slate-500">تبرعات لها Timeline</div><div className="mt-1 text-2xl font-black">{timelines.length}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-slate-500">تم الإرسال</div><div className="mt-1 text-2xl font-black text-emerald-700">{statusCounts.SENT || 0}</div></CardContent></Card>
      <Card><CardContent className="p-4"><div className="text-xs text-slate-500">فشل / تخطي</div><div className="mt-1 text-2xl font-black text-rose-700">{(statusCounts.FAILED || 0) + (statusCounts.SKIPPED || 0)}</div></CardContent></Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>{view === "timeline" ? "Timeline التبرعات" : "السجل الفني"}</CardTitle>
        <CardDescription>
          إجمالي مطابق للفلاتر: {total}
          {rawTotal > total ? ` من أصل ${rawTotal} سجل خام بعد الدمج` : ""}
          {source ? ` — ${sourceLabel(source)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {source === "auditLogFallback" ? <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">هذه النتائج من سجل التدقيق الاحتياطي. الأحداث الجديدة بعد آخر تحديث يجب أن تظهر من المصدر الأساسي ConversionEvent.</div> : null}
        {source === "ConversionEvent" ? <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">النتائج الحالية من المصدر الأساسي ConversionEvent.</div> : null}
        {loading ? <div className="flex min-h-[18rem] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div> : view === "timeline" ? <div className="space-y-3">
          {timelines.length === 0 ? <EmptyState icon={Activity} title="لا توجد أحداث مطابقة" description="لا يوجد حدث تحويل يطابق التصفية الحالية. جرّب توسيع النطاق الزمني أو تغيير نوع الحدث." /> :timelines.map((timeline) => <div key={timeline.key} className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                <div className="text-xs text-slate-500">Donation ID</div>
                <div className="mt-1 font-mono text-sm font-bold text-slate-900">{timeline.donationId}</div>
              </div>
              <div className="text-sm text-slate-600">{timeline.amountLabel}</div>
              <div className="text-sm text-slate-600">{timeline.platforms.length ? timeline.platforms.join(" · ") : "—"}</div>
              <div className="text-xs text-slate-500">{statusSummary(timeline.statuses)}</div>
              {timeline.donationId !== "—" ? <Link href={timelineHref(timeline.donationId)} className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-bold text-brand hover:bg-slate-50">فتح Timeline</Link> : null}
              <Button size="sm" variant="outline" disabled={!timeline.canRetry || retryingDonationId === timeline.donationId} onClick={() => retryDonation(timeline.donationId)} className="gap-2">
                {retryingDonationId === timeline.donationId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                إعادة المحاولة
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {timeline.events.map((row, index) => <div key={rowKey(row, index)} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm md:grid-cols-[9rem_7rem_7rem_1fr_8rem_1fr]">
                <div className="text-slate-500">{renderDate(row.createdAt)}</div>
                <div className="font-semibold">{row.platform ?? "—"}</div>
                <div>{row.channel ?? "—"}</div>
                <div>{row.eventName ?? "—"}<div className="mt-1 truncate font-mono text-[11px] text-slate-400">{row.eventId ?? "—"}</div></div>
                <div><span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></div>
                <div className="truncate text-xs text-rose-700">{row.error ?? "—"}</div>
              </div>)}
            </div>
          </div>)}
        </div> : <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ</th>
                <th className="px-3 py-2 text-right">المنصة</th>
                <th className="px-3 py-2 text-right">القناة</th>
                <th className="px-3 py-2 text-right">الحدث</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">المبلغ</th>
                <th className="px-3 py-2 text-right">محاولات</th>
                <th className="px-3 py-2 text-right">Donation ID</th>
                <th className="px-3 py-2 text-right">Event ID</th>
                <th className="px-3 py-2 text-right">خطأ</th>
                <th className="px-3 py-2 text-right">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? <tr><td colSpan={11} className="p-0"><EmptyState variant="inline" icon={Activity} title="لا توجد أحداث مطابقة" description="لا يوجد حدث تحويل يطابق التصفية الحالية." /></td></tr> :events.map((row, index) => <tr key={rowKey(row, index)} className="border-t">
                <td className="whitespace-nowrap px-3 py-2">{renderDate(row.createdAt)}</td>
                <td className="px-3 py-2 font-semibold">{row.platform ?? "—"}</td>
                <td className="px-3 py-2">{row.channel ?? "—"}</td>
                <td className="px-3 py-2">{row.eventName ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                <td className="whitespace-nowrap px-3 py-2">{moneyLabel(row)}</td>
                <td className="px-3 py-2">{row.attempts ?? 0}</td>
                <td className="max-w-[13rem] truncate px-3 py-2 font-mono text-xs">{row.donationId ?? "—"}</td>
                <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs">{row.eventId ?? "—"}</td>
                <td className="max-w-[20rem] truncate px-3 py-2 text-xs text-rose-700">{row.error ?? "—"}</td>
                <td className="px-3 py-2">{row.donationId ? <Link href={timelineHref(row.donationId)} className="text-xs font-bold text-brand hover:underline">فتح</Link> : "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
