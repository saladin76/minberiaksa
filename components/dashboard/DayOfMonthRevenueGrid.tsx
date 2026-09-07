"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Info } from "lucide-react";
import {
  DayOfMonthDetailsDialog,
  type DayOfMonthDetailFilters,
} from "@/components/dashboard/DayOfMonthDetailsDialog";

export type DayOfMonthPoint = {
  /** 1..31 */
  day: number;
  amountUSD: number;
  count: number;
  /** collected view only — how many distinct months contributed to this day. */
  monthsObserved?: number;
};

type Mode = "collected" | "expected";

type Props = {
  collected: DayOfMonthPoint[];
  expected: DayOfMonthPoint[];
  loading?: boolean;
  formatMoney: (value: number) => string;
  /**
   * The page's active filters. Passed straight through to the drill-down so the
   * rows it lists are the same population the cells were computed from.
   */
  filters?: DayOfMonthDetailFilters;
};

/**
 * Sequential single-hue ramp (brand blue, light → dark) for magnitude. Every step's text
 * contrast was measured against WCAG AA, not eyeballed: steps 1–4 carry slate-900 ink
 * (6.8:1 at the darkest) and only the top step flips to white on brand (6.4:1).
 * The number is printed in every cell, so magnitude is never encoded by color alone.
 */
const RAMP = [
  { bg: "#F8FAFC", ink: "#CBD5E1" }, // 0 — nothing landed
  { bg: "#EAF2FC", ink: "#0F172A" },
  { bg: "#CFE2F8", ink: "#0F172A" },
  { bg: "#A9C9F0", ink: "#0F172A" },
  { bg: "#6FA3E0", ink: "#0F172A" },
  { bg: "#025EB8", ink: "#FFFFFF" }, // 5 — peak band
];

function rampStep(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  const share = amount / max;
  if (share <= 0.2) return 1;
  if (share <= 0.4) return 2;
  if (share <= 0.6) return 3;
  if (share <= 0.85) return 4;
  return 5;
}

export function DayOfMonthRevenueGrid({ collected, expected, loading, formatMoney, filters }: Props) {
  const [mode, setMode] = useState<Mode>("expected");
  /** Which day's drill-down is open, if any. */
  const [openDay, setOpenDay] = useState<number | null>(null);
  const data = mode === "collected" ? collected : expected;

  const stats = useMemo(() => {
    const total = data.reduce((s, d) => s + (d.amountUSD ?? 0), 0);
    const count = data.reduce((s, d) => s + (d.count ?? 0), 0);
    const max = data.reduce((m, d) => Math.max(m, d.amountUSD ?? 0), 0);
    const activeDays = data.filter((d) => (d.amountUSD ?? 0) > 0).length;
    const peak = data.reduce<DayOfMonthPoint | null>(
      (best, d) => ((d.amountUSD ?? 0) > (best?.amountUSD ?? 0) ? d : best),
      null
    );
    return { total, count, max, activeDays, peak };
  }, [data]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-4 h-5 w-56 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 31 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-lg bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand">
            <CalendarRange className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold leading-tight text-slate-900">الوارد حسب يوم الشهر</h2>
            <p className="text-xs text-slate-500">
              {mode === "collected"
                ? "إجمالي ما تم تحصيله فعليًا في كل يوم من الشهر، مجمّعًا عبر كل الشهور"
                : "ما تجدّده الاشتراكات النشطة في كل يوم من الشهر (دورة شهرية واحدة)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { key: "expected" as const, label: "المتوقع" },
                { key: "collected" as const, label: "المحصّل" },
              ]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                aria-pressed={mode === opt.key}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === opt.key ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="text-end">
            <p className="text-[11px] text-slate-500">{mode === "collected" ? "إجمالي المحصّل" : "الإجمالي المتوقع شهريًا"}</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">{formatMoney(stats.total)}</p>
          </div>
        
        </div>
      </header>

      <div className="p-4">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {data.map((d) => {
            const amount = d.amountUSD ?? 0;
            const step = rampStep(amount, stats.max);
            const tone = RAMP[step];
            const isPeak = stats.peak?.day === d.day && amount > 0;
            const perMonth = d.monthsObserved && d.monthsObserved > 0 ? amount / d.monthsObserved : null;

            return (
              <div key={d.day} className="group relative">
                <button
                  type="button"
                  // Empty days have nothing to drill into — leave them inert rather than
                  // opening a dialog that can only say "no data".
                  disabled={amount <= 0}
                  onClick={() => setOpenDay(d.day)}
                  aria-label={`عرض تفاصيل اليوم ${d.day} من الشهر`}
                  title={amount > 0 ? "اضغط لعرض التفاصيل" : undefined}
                  className={`flex h-[74px] w-full flex-col justify-between rounded-lg p-2 text-right transition-transform duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
                    amount > 0 ? "cursor-pointer group-hover:-translate-y-0.5" : "cursor-default"
                  } ${isPeak ? "ring-2 ring-brand ring-offset-1" : ""}`}
                  style={{ backgroundColor: tone.bg, color: tone.ink }}
                >
                  <span className="text-[11px] font-bold tabular-nums opacity-70">{d.day}</span>
                  <span className="truncate text-[12px] font-bold tabular-nums leading-tight">
                    {amount > 0 ? formatMoney(amount) : "—"}
                  </span>
                  <span className="text-[10px] tabular-nums opacity-65">
                    {d.count > 0 ? (mode === "collected" ? `${d.count} تبرع` : `${d.count} اشتراك`) : ""}
                  </span>
                </button>

                {amount > 0 && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg group-hover:block">
                    <p className="font-semibold">اليوم {d.day} من كل شهر</p>
                    <p className="tabular-nums text-slate-200">{formatMoney(amount)}</p>
                    {mode === "collected" ? (
                      <p className="tabular-nums text-slate-400">
                        {d.count} تبرع
                        {d.monthsObserved ? ` · عبر ${d.monthsObserved} شهر` : ""}
                        {perMonth !== null && d.monthsObserved && d.monthsObserved > 1
                          ? ` · ${formatMoney(perMonth)} شهريًا`
                          : ""}
                      </p>
                    ) : (
                      <p className="tabular-nums text-slate-400">{d.count} اشتراك نشط</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">أقل</span>
            <div className="flex gap-0.5">
              {RAMP.slice(1).map((tone) => (
                <span
                  key={tone.bg}
                  className="h-3 w-6 rounded-[3px]"
                  style={{ backgroundColor: tone.bg }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className="text-[11px] text-slate-500">أعلى</span>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              {mode === "collected"
                ? "الاشتراك يتجدّد في نفس اليوم من كل شهر، فهذه هي أيام دخول المال فعليًا."
                : "محسوب من تاريخ التجديد القادم للاشتراكات النشطة."}{" "}
              <b className="font-semibold text-slate-600">اضغط أي يوم لعرض تفاصيله.</b>
            </span>
          </p>
        </div>
      </div>

      <DayOfMonthDetailsDialog
        day={openDay}
        mode={mode}
        filters={filters}
        formatMoney={formatMoney}
        onClose={() => setOpenDay(null)}
      />
    </section>
  );
}
