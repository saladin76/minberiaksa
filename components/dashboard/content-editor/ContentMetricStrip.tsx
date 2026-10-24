import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ContentMetric = {
  label: string;
  value: number | string;
  detail?: string;
  icon: LucideIcon;
  tone?: "brand" | "green" | "amber" | "slate";
};

const toneClasses = {
  brand: "bg-brand-50 text-brand",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-600",
};

export function ContentMetricStrip({ items }: { items: ContentMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="overflow-hidden border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneClasses[item.tone ?? "brand"])}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-xl font-semibold leading-6 tabular-nums text-slate-900">{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</p>
                {item.detail && <p className="mt-1 truncate text-[11px] text-slate-400">{item.detail}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
