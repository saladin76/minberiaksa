"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { createFormatDashboardMoney } from "@/lib/dashboard/format-dashboard-money";
import { dt } from "@/lib/dashboard/i18n";

type Metric = { amountUSD: number; count: number; unpriced: number };
type Summary = { today: Metric; month: Metric; support: Metric; failed: Metric; averageUSD: number | null; todayKey?: string; monthKey?: string; bank: Metric };

export function HomeDonationSummary({ onRefresh }: { onRefresh?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getSelectedCurrency, convertToCurrency } = useCurrency();
  const format = createFormatDashboardMoney({ getSelectedCurrency, convertToCurrency });
  const load = useCallback(async () => {
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
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const cards: Array<{ title: string; metric?: Metric; average?: boolean }> = [
    { title: dt("إيرادات ناجحة ({0})", [dt("اليوم")]), metric: summary?.today },
    { title: dt("إيرادات ناجحة ({0})", [dt("شهر")]), metric: summary?.month },
    { title: `${dt("دعم الفريق")} (${dt("شهر")})`, metric: summary?.support },
    { title: `${dt("الحوالات البنكية")} (${dt("شهر")})`, metric: summary?.bank },
    { title: `${dt("تبرعات فاشلة")} (${dt("شهر")})`, metric: summary?.failed },
    { title: dt("متوسط التبرع"), average: true },
  ];
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={dt("المؤشرات")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{dt("المؤشرات")}</h2><p className="text-xs text-slate-500" dir="ltr">{summary?.todayKey} · {summary?.monthKey} · Europe/Istanbul</p></div><button type="button" onClick={() => { void load(); onRefresh?.(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{dt("تحديث")}</button></div>
    {error ? <p role="alert" className="text-sm text-red-700">{dt("تعذر تحميل البيانات")}</p> : null}
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">{cards.map(card => <div key={card.title} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold text-slate-600">{card.title}</p><p className="mt-2 text-xl font-bold tabular-nums" dir="ltr">{card.average ? summary?.averageUSD != null ? format(summary.averageUSD, "USD", summary.averageUSD) : "—" : card.metric && !card.metric.unpriced ? format(card.metric.amountUSD, "USD", card.metric.amountUSD) : "—"}</p>{!card.average ? <p className="mt-1 text-xs text-slate-500">{dt("عدد: {0}", [card.metric ? card.metric.count : "—"])}</p> : <p className="mt-1 text-xs text-slate-500">{dt("من التبرعات الناجحة ({0})", [dt("شهر")])}</p>}</div>)}</div>
  </section>;
}
