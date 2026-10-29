import { dashIntl } from "@/lib/dashboard/i18n";
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
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="overflow-hidden border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
              <span className={cn("grid h-8 w-8 shrink-0 sm:h-10 sm:w-10 place-items-center rounded-xl", toneClasses[item.tone ?? "brand"])}>
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium sm:text-xs text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-lg font-semibold sm:text-xl leading-6 tabular-nums text-slate-900">{typeof item.value === "number" ? item.value.toLocaleString(dashIntl("ar-EG")) : item.value}</p>
                {item.detail && <p className="mt-1 line-clamp-2 text-[10px] text-slate-400 sm:text-[11px]">{item.detail}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
