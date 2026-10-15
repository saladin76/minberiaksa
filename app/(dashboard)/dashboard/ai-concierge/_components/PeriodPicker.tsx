"use client";

import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashDir, dt } from "@/lib/dashboard/i18n";

export type Period = { preset: string; from: string; to: string };

export const PERIOD_PRESETS: { value: string; label: string }[] = [
  { value: "1", get label() { return dt("اليوم"); } },
  { value: "7", get label() { return dt("آخر 7 أيام"); } },
  { value: "30", get label() { return dt("آخر 30 يومًا"); } },
  { value: "90", get label() { return dt("آخر 90 يومًا"); } },
  { value: "365", get label() { return dt("آخر سنة"); } },
  { value: "custom", get label() { return dt("فترة مخصصة"); } },
];

export const DEFAULT_PERIOD: Period = { preset: "30", from: "", to: "" };

/** Query string for the concierge APIs: `days=` or `from=&to=`. */
export function periodParams(p: Period): URLSearchParams {
  const q = new URLSearchParams();
  if (p.preset === "custom" && p.from) {
    q.set("from", p.from);
    if (p.to) q.set("to", p.to);
  } else {
    q.set("days", p.preset === "custom" ? "30" : p.preset);
  }
  return q;
}

export function periodLabel(p: Period): string {
  if (p.preset === "custom" && p.from) return `${p.from} → ${p.to || dt("اليوم")}`;
  return PERIOD_PRESETS.find((x) => x.value === p.preset)?.label ?? "";
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={(preset) => onChange({ ...value, preset })} dir={dashDir()}>
        <SelectTrigger className="h-9 w-[160px] bg-white text-[13px]">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value} className="text-[13px]">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <>
          <Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-9 w-[150px] bg-white text-[13px]" aria-label={dt("من")} />
          <span className="text-xs text-slate-400">{dt("إلى")}</span>
          <Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-9 w-[150px] bg-white text-[13px]" aria-label={dt("إلى")} />
        </>
      )}
    </div>
  );
}
