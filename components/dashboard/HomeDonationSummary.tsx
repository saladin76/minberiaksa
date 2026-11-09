"use client";

import { useCurrency } from "@/context/CurrencyContext";
import { createFormatDashboardMoney } from "@/lib/dashboard/format-dashboard-money";
import { dt } from "@/lib/dashboard/i18n";
import type { ScopedDonationChartRow } from "@/lib/dashboard/donation-chart-filter-scope";
import { summarizeScopedDonationChart } from "@/lib/dashboard/donation-chart-filter-scope";
import { cn } from "@/lib/utils";
import { CircleDollarSign, HeartHandshake, Repeat, RefreshCw, TrendingUp, TriangleAlert, Wallet } from "lucide-react";

type Scoped = ReturnType<typeof summarizeScopedDonationChart>;
type Props = {
  scoped: Scoped;
  loading: boolean;
  periodLabel: string;
  onRefresh?: () => void;
};

/**
 * The headline cards share the exact filtered, settled chart series.
 * No independent all-time/today/month fetch may overwrite the active scope.
 */
export function HomeDonationSummary({ scoped, loading, periodLabel, onRefresh }: Props) {
  const { getSelectedCurrency, convertToCurrency } = useCurrency();
  const format = createFormatDashboardMoney({ getSelectedCurrency, convertToCurrency });
  const money = (amount: number) => loading ? "…" : format(amount, "USD", amount);
  const number = (count: number) => loading ? "…" : count.toLocaleString("en-US");
  const cards = [
    { title: dt("تبرعات ناجحة"), amount: scoped.paidAmountUSD, count: scoped.paidCount, icon: CircleDollarSign, tone: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white", iconTone: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500" },
    { title: dt("لمرة واحدة"), amount: scoped.oneTimeAmountUSD, count: scoped.oneTimeCount, icon: Wallet, tone: "border-blue-200 bg-gradient-to-br from-blue-50 to-white", iconTone: "bg-blue-100 text-blue-700", accent: "bg-blue-500" },
    { title: dt("دورية"), amount: scoped.recurringAmountUSD, count: scoped.recurringCount, icon: Repeat, tone: "border-violet-200 bg-gradient-to-br from-violet-50 to-white", iconTone: "bg-violet-100 text-violet-700", accent: "bg-violet-500" },
    { title: dt("دعم الفريق"), amount: scoped.teamSupportUSD, count: scoped.paidCount, icon: HeartHandshake, tone: "border-amber-200 bg-gradient-to-br from-amber-50 to-white", iconTone: "bg-amber-100 text-amber-700", accent: "bg-amber-500" },
    { title: dt("تبرعات فاشلة"), amount: scoped.attemptedFailedAmountUSD, count: scoped.failedCount, icon: TriangleAlert, tone: "border-rose-200 bg-gradient-to-br from-rose-50 to-white", iconTone: "bg-rose-100 text-rose-700", accent: "bg-rose-500" },
    { title: dt("قيد التأكيد"), amount: null, count: scoped.pendingCount, icon: RefreshCw, tone: "border-slate-200 bg-gradient-to-br from-slate-50 to-white", iconTone: "bg-slate-100 text-slate-700", accent: "bg-slate-500" },
    { title: dt("متوسط التبرع"), amount: scoped.paidCount > 0 ? scoped.paidAmountUSD / scoped.paidCount : null, count: null, icon: TrendingUp, tone: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white", iconTone: "bg-indigo-100 text-indigo-700", accent: "bg-indigo-500" },
  ];
  return (
    <section className="space-y-3" aria-label={dt("المؤشرات")} aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{dt("المؤشرات")}</h2>
          <p className="text-xs text-slate-500">{periodLabel} · {dt("حسب عوامل التصفية المختارة")}</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />{dt("تحديث")}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return <article key={card.title} aria-label={card.title} className={cn("relative min-w-0 overflow-hidden rounded-xl border p-3 shadow-sm", card.tone)}>
            <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-1", card.accent)} />
            <div className="flex items-center gap-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", card.iconTone)}><Icon aria-hidden="true" className="h-4 w-4" /></span>
              <h3 className="text-xs font-semibold leading-4 text-slate-700">{card.title}</h3>
            </div>
            <p className="my-1 break-words text-[22px] font-bold leading-6 tabular-nums tracking-tight text-slate-950" dir="ltr">
              {card.amount === null ? number(card.count ?? 0) : money(card.amount)}
            </p>
            {card.count !== null && <span className="inline-flex rounded-full border border-white/80 bg-white/75 px-2 py-0.5 text-[10px] font-medium leading-3 text-slate-600">{dt("عدد: {0}", [number(card.count)])}</span>}
            {card.title === dt("تبرعات فاشلة") && <p className="text-[10px] text-rose-700">{dt("مبلغ المحاولات الفاشلة ليس إيرادًا")}</p>}
          </article>;
        })}
      </div>
    </section>
  );
}
