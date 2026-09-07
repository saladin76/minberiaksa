"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AdsChartPeriod = "day" | "week" | "month" | "all" | "custom";

const PERIOD_LABELS: Record<AdsChartPeriod, string> = {
  day: "آخر يوم",
  week: "آخر أسبوع",
  month: "آخر شهر",
  all: "كل الوقت",
  custom: "مخصص",
};

interface Props {
  period: AdsChartPeriod;
  dateFrom: string;
  dateTo: string;
  onPeriodChange: (p: AdsChartPeriod) => void;
  onDateFromChange: (s: string) => void;
  onDateToChange: (s: string) => void;
}

export function AdsFiltersBar({
  period,
  dateFrom,
  dateTo,
  onPeriodChange,
  onDateFromChange,
  onDateToChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-slate-500">الفترة</label>
        <Select
          value={period === "custom" || (dateFrom && dateTo) ? "custom" : period}
          onValueChange={(v) => onPeriodChange(v as AdsChartPeriod)}
        >
          <SelectTrigger className="w-[160px] h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as AdsChartPeriod[]).map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {period === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500">من</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-[140px] h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500">إلى</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-[140px] h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50"
            />
          </div>
        </>
      )}
    </div>
  );
}
