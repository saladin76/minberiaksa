"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";
export function DashboardFilterPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="mb-3 flex min-h-11 w-full items-center justify-between rounded-xl border bg-slate-50 px-3 text-sm sm:hidden"><span className="flex items-center gap-2"><SlidersHorizontal size={16} />{dt("الفلاتر والفترة")}</span><ChevronDown size={16} className={open ? "rotate-180" : ""} /></button><div id={id} className={`${open ? "block" : "hidden"} space-y-4 sm:block`}>{children}</div></div>;
}
