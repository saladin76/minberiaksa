"use client";
import * as React from "react";
import { dt } from "@/lib/dashboard/i18n";

export type PickOption = { value: string; label: string; count?: number };

/** Several values at once: searchable checklist with counts, a summary, clear and done (owner, 2026-11-21). */
export default function MultiPick({ label, allLabel, options, selected, onChange, labelClassName = "text-[11px] font-semibold text-slate-600" }: {
  label: string; allLabel: string; options: PickOption[]; selected: string[]; onChange: (next: string[]) => void; labelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false), [q, setQ] = React.useState("");
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const chosen = options.filter((o) => selected.includes(o.value));
  const summary = chosen.length === 0 ? allLabel : chosen.length <= 2 ? chosen.map((o) => o.label).join("، ") : `${chosen.slice(0, 2).map((o) => o.label).join("، ")} +${chosen.length - 2}`;
  const shown = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative space-y-1 text-start" ref={box}>
      <label className={labelClassName}>{label}</label>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" aria-label={label}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-start text-[13px] shadow-sm ${chosen.length ? "border-emerald-400" : "border-slate-200 hover:border-slate-300"}`}>
        <span className="truncate">{summary}</span>
        {chosen.length ? <span className="shrink-0 rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-800">{chosen.length}</span> : null}
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full min-w-[240px] rounded-lg border bg-white p-2 shadow-lg">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt("بحث…")} className="mb-2 w-full rounded border px-2 py-1 text-sm" autoFocus />
          <div className="max-h-64 overflow-y-auto">
            {shown.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                <span className="flex-1 truncate">{o.label}</span>
                {typeof o.count === "number" ? <span className="text-[11px] text-slate-400">{o.count}</span> : null}
              </label>
            ))}
            {shown.length === 0 ? <p className="p-2 text-xs text-slate-400">{dt("لا نتائج")}</p> : null}
          </div>
          <div className="mt-2 flex justify-between border-t pt-2">
            <button type="button" onClick={() => onChange([])} className="text-xs text-slate-500 hover:text-red-600">{dt("مسح الاختيار")}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded bg-slate-800 px-2 py-1 text-xs text-white">{dt("تم")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
