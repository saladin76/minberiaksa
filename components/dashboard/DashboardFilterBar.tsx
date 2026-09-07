"use client";

import { useMemo, type ReactNode } from "react";
import { CalendarDays, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PeriodOption<T extends string = string> = { value: T; label: string };

export type ActiveFilterChip = {
  /** Stable key, also used as the React key. */
  id: string;
  /** e.g. "الحملة" */
  label: string;
  /** e.g. "رمضان 2026" */
  value: string;
  onClear: () => void;
};

type Props<T extends string> = {
  periods: readonly PeriodOption<T>[];
  period: T;
  onPeriodChange: (period: T) => void;

  /** Value that puts the bar into custom-range mode. */
  customValue?: T;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;

  /** Extra controls (category / campaign / donor selects). */
  children?: ReactNode;
  /** Right-aligned actions (export, refresh). */
  actions?: ReactNode;

  /** Rendered as dismissible chips beneath the controls. */
  activeFilters?: ActiveFilterChip[];
  onClearAll?: () => void;

  className?: string;
};

/**
 * Filter toolbar for the analytics pages.
 *
 * Rebuilt rather than restyled. The previous control was a single `<Select>` listing every
 * period, so choosing a range meant opening a menu to discover the options, and the date
 * inputs only materialised *after* you found and picked "custom" — the range controls were
 * invisible until you already knew they existed.
 *
 * This exposes the periods as a segmented control (all options visible, one click to switch),
 * reveals the range inputs inline when the custom segment is active, and surfaces every
 * applied filter as a dismissible chip so no filter can silently skew the numbers above.
 */
export function DashboardFilterBar<T extends string>({
  periods, period, onPeriodChange,
  customValue, dateFrom, dateTo, onDateFromChange, onDateToChange,
  children, actions, activeFilters, onClearAll, className,
}: Props<T>) {
  const isCustom = customValue !== undefined && period === customValue;
  const chips = useMemo(() => activeFilters?.filter(Boolean) ?? [], [activeFilters]);

  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-4",
        className,
      )}
      aria-label="تصفية البيانات"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented period control — every option visible at once. */}
        <div
          role="group"
          aria-label="الفترة الزمنية"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1"
        >
          {periods.map((option) => {
            const active = option.value === period;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPeriodChange(option.value)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-all",
                  active
                    ? "bg-white text-brand shadow-[0_1px_3px_rgba(16,24,40,0.10)]"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {isCustom && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="date"
              value={dateFrom ?? ""}
              onChange={(e) => onDateFromChange?.(e.target.value)}
              aria-label="من تاريخ"
              className="h-7 w-[130px] rounded-md border-0 bg-transparent px-1 text-[13px] text-slate-800 outline-none focus:ring-0"
            />
            <span className="text-slate-300" aria-hidden>—</span>
            <input
              type="date"
              value={dateTo ?? ""}
              onChange={(e) => onDateToChange?.(e.target.value)}
              aria-label="إلى تاريخ"
              className="h-7 w-[130px] rounded-md border-0 bg-transparent px-1 text-[13px] text-slate-800 outline-none focus:ring-0"
            />
          </div>
        )}

        {children}

        {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            عوامل التصفية
          </span>
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 ps-2.5 pe-1.5 text-[12px] font-medium text-brand-700"
            >
              <span className="text-brand-700/60">{chip.label}:</span>
              <span className="max-w-[160px] truncate">{chip.value}</span>
              <button
                type="button"
                onClick={chip.onClear}
                aria-label={`إزالة تصفية ${chip.label}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-brand-700/60 transition-colors hover:bg-brand-200 hover:text-brand-800"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <RotateCcw className="h-3 w-3" />
              مسح الكل
            </button>
          )}
        </div>
      )}
    </section>
  );
}
