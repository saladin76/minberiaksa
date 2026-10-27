"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, CircleDollarSign, HeartHandshake, Landmark, RefreshCw, TrendingUp, TriangleAlert } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { createFormatDashboardMoney } from "@/lib/dashboard/format-dashboard-money";
import { dt } from "@/lib/dashboard/i18n";
import { cn } from "@/lib/utils";

type Metric = { amountUSD: number; count: number; unpriced: number };
type Summary = { today: Metric; month: Metric; support: Metric; failed: Metric; averageUSD: number | null; todayKey?: string; monthKey?: string; bank: Metric };

export function HomeDonationSummary({ onRefresh }: { onRefresh?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const { getSelectedCurrency, convertToCurrency } = useCurrency();
  const format = createFormatDashboardMoney({ getSelectedCurrency, convertToCurrency });
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true); setError(false);
    try {
      const [response, bankResponse] = await Promise.all([
        fetch("/api/admin/dashboard-summary", { cache: "no-store", signal: AbortSignal.timeout(20_000) }),
        fetch("/api/admin/bank-transfers/summary?period=month", { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null),
      ]);
      if (!response.ok) throw new Error("summary unavailable");
      const data = await response.json();
      const bank = bankResponse?.ok ? await bankResponse.json() : null;
      setSummary({ ...data, bank: { amountUSD: bank?.totalUsd ?? 0, count: bank?.approvedCount ?? 0, unpriced: bank ? bank.unconvertedCurrencies ?? 0 : 1 } });
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch { setError(true); }
    finally { busy.current = false; setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const cards = [
    { title: dt("إيرادات ناجحة ({0})", [dt("اليوم")]), metric: summary?.today, icon: CircleDollarSign, tone: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white", iconTone: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500" },
    { title: dt("إيرادات ناجحة ({0})", [dt("هذا الشهر")]), metric: summary?.month, icon: CalendarDays, tone: "border-blue-200 bg-gradient-to-br from-blue-50 to-white", iconTone: "bg-blue-100 text-blue-700", accent: "bg-blue-500" },
    { title: `${dt("دعم الفريق")} (${dt("هذا الشهر")})`, metric: summary?.support, icon: HeartHandshake, tone: "border-violet-200 bg-gradient-to-br from-violet-50 to-white", iconTone: "bg-violet-100 text-violet-700", accent: "bg-violet-500" },
    { title: `${dt("الحوالات البنكية")} (${dt("هذا الشهر")})`, metric: summary?.bank, icon: Landmark, tone: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white", iconTone: "bg-cyan-100 text-cyan-700", accent: "bg-cyan-500" },
    { title: `${dt("تبرعات فاشلة")} (${dt("هذا الشهر")})`, metric: summary?.failed, icon: TriangleAlert, tone: "border-rose-200 bg-gradient-to-br from-rose-50 to-white", iconTone: "bg-rose-100 text-rose-700", accent: "bg-rose-500" },
    { title: dt("متوسط التبرع"), average: true, icon: TrendingUp, tone: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white", iconTone: "bg-indigo-100 text-indigo-700", accent: "bg-indigo-500" },
  ];
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={dt("المؤشرات")} aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{dt("المؤشرات")}</h2><p className="text-xs text-slate-500" dir="ltr">{summary?.todayKey} · {summary?.monthKey} · Europe/Istanbul</p></div><button type="button" onClick={() => { void load(); onRefresh?.(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{dt("تحديث")}</button></div>
    {updatedAt && !loading && !error && <p role="status" className="text-xs text-emerald-700">{dt("تم التحديث")} · {updatedAt}</p>}
    {error ? <p role="alert" className="text-sm text-red-700">{dt("تعذر تحميل البيانات")}</p> : null}
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">{cards.map(card => {
      const Icon = card.icon;
      return <article key={card.title} aria-label={card.title} className={cn("relative min-w-0 overflow-hidden rounded-2xl border p-4 shadow-[0_2px_6px_rgba(15,23,42,0.035)] sm:p-5", card.tone)}>
        <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-1", card.accent)} />
        <div className="flex items-center gap-3"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", card.iconTone)}><Icon aria-hidden="true" className="h-5 w-5" /></span><h3 className="text-[13px] font-semibold leading-5 text-slate-700">{card.title}</h3></div>
        <p className="my-3 break-words text-[27px] font-bold leading-tight tabular-nums tracking-tight text-slate-950" dir="ltr">{card.average ? summary?.averageUSD != null ? format(summary.averageUSD, "USD", summary.averageUSD) : "—" : card.metric && !card.metric.unpriced ? format(card.metric.amountUSD, "USD", card.metric.amountUSD) : "—"}</p>
        {!card.average ? <span className="inline-flex rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-xs font-medium text-slate-600">{dt("عدد: {0}", [card.metric ? card.metric.count : "—"])}</span> : <p className="text-xs leading-5 text-slate-500">{dt("من التبرعات الناجحة ({0})", [dt("هذا الشهر")])}</p>}
      </article>;
    })}</div>
  </section>;
}
