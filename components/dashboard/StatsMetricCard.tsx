"use client";

import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/context/CurrencyContext";
import { DASHBOARD_DISPLAY_SYMBOLS } from "@/lib/dashboard/format-dashboard-money";

type Accent = "emerald" | "teal" | "amber" | "orange" | "violet" | "indigo" | "slate" | "blue" | "rose" | "sky";
const ACCENT_CLASSES: Record<Accent, { bg: string; icon: string; badge: string; rail: string }> = {
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700", rail: "bg-emerald-500" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", badge: "bg-teal-100 text-teal-700", rail: "bg-teal-500" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", badge: "bg-amber-100 text-amber-700", rail: "bg-amber-500" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", badge: "bg-orange-100 text-orange-700", rail: "bg-orange-500" },
  violet: { bg: "bg-violet-50", icon: "text-violet-600", badge: "bg-violet-100 text-violet-700", rail: "bg-violet-500" },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", badge: "bg-indigo-100 text-indigo-700", rail: "bg-indigo-500" },
  slate: { bg: "bg-slate-50", icon: "text-slate-500", badge: "bg-slate-100 text-slate-600", rail: "bg-slate-300" },
  blue: { bg: "bg-blue-50", icon: "text-blue-600", badge: "bg-blue-100 text-blue-700", rail: "bg-brand" },
  rose: { bg: "bg-rose-50", icon: "text-rose-600", badge: "bg-rose-100 text-rose-700", rail: "bg-rose-500" },
  sky: { bg: "bg-sky-50", icon: "text-sky-600", badge: "bg-sky-100 text-sky-700", rail: "bg-sky-500" },
};

function formatValue(value: number, format?: "money" | "number" | "percent"): string {
  const latn = (n: number, options?: Intl.NumberFormatOptions) => n.toLocaleString("en-US", { numberingSystem: "latn", ...options });
  if (format === "money") return `$${latn(value, { maximumFractionDigits: 2 })}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  return latn(value, { maximumFractionDigits: 0 });
}
function formatCurrency(value: number | undefined, currency: string): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${safeValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}
function formatSelectedCurrency(value: number, currency: string) {
  const sym = DASHBOARD_DISPLAY_SYMBOLS[currency] ?? `${currency} `;
  return sym + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function currencyBreakdown(totals?: Record<string, number>) {
  const entries = Object.entries(totals ?? {}).filter(([, value]) => typeof value === "number" && value > 0);
  if (!entries.length) return "لا توجد حوالات معتمدة بعد";
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" • ");
}

type BankTransfersSummary = { totals?: Record<string, number>; usdTotals?: Record<string, number>; totalUsd?: number; approvedCount?: number; pendingCount?: number };
interface StatsMetricCardProps { title: string; value: number; icon: LucideIcon; accent?: Accent; format?: "money" | "number" | "percent"; subtitle?: string; compact?: boolean; variant?: "default" | "hero"; }

export function StatsMetricCard({ title, value, icon: Icon, accent = "slate", format, subtitle, compact, variant = "default" }: StatsMetricCardProps) {
  const colors = ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.slate;
  const isHero = variant === "hero";
  const shouldShowBankTransfers = title.includes("إيرادات ناجحة") && title.includes("كل الوقت");
  const [bankSummary, setBankSummary] = useState<BankTransfersSummary | null>(null);
  const { convertToCurrency, getSelectedCurrency } = useCurrency();

  useEffect(() => {
    if (!shouldShowBankTransfers) return;
    let cancelled = false;
    fetch("/api/admin/bank-transfers/summary").then((res) => (res.ok ? res.json() : null)).then((data) => { if (!cancelled) setBankSummary(data); }).catch(() => { if (!cancelled) setBankSummary(null); });
    return () => { cancelled = true; };
  }, [shouldShowBankTransfers]);

  const selectedCurrency = getSelectedCurrency?.() ?? "DEFAULT";
  const selectedCode = selectedCurrency === "DEFAULT" ? "USD" : selectedCurrency;
  const bankUsd = bankSummary?.totalUsd ?? bankSummary?.totals?.USD ?? 0;
  const bankDisplayValue = selectedCurrency === "DEFAULT" ? bankUsd : (convertToCurrency(bankUsd)?.convertedValue ?? bankUsd);
  const displayedValue = shouldShowBankTransfers && format === "money" ? value + bankDisplayValue : value;
  const displayedSubtitle = shouldShowBankTransfers ? `الموقع: ${formatSelectedCurrency(value, selectedCode)} • البنوك: ${formatSelectedCurrency(bankDisplayValue, selectedCode)}` : subtitle;

  // Presentation rebuilt for legibility. The previous card gave the LABEL more visual weight
  // than the NUMBER (11px label vs 16px value), so a wall of 17 of these read as grey noise.
  // Now: small muted label, large tabular figure, icon as a quiet accent, and a coloured rail
  // that makes the accent scannable at a glance instead of a tiny tinted square.
  const shell = cn(
    "group relative overflow-hidden rounded-xl border border-slate-200 bg-white",
    "shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200",
    "hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)] hover:border-slate-300 hover:-translate-y-px",
    compact ? "p-3.5" : "p-4",
    isHero && "ring-1 ring-brand/25 border-brand/30",
  );

  const Rail = () => (
    <span className={cn("absolute inset-y-0 start-0 w-1 opacity-70", colors.rail)} aria-hidden />
  );

  const mainCard = (
    <div className={shell}>
      <Rail />
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p className={cn(
          "min-w-0 flex-1 font-medium leading-snug text-slate-500",
          compact ? "text-[11.5px]" : "text-xs",
        )}>
          {shouldShowBankTransfers ? "إجمالي الإيرادات: الموقع + الحسابات البنكية" : title}
        </p>
        <span className={cn("shrink-0 rounded-lg p-1.5 transition-colors", colors.bg, colors.icon)}>
          <Icon className={compact ? "w-4 h-4" : "w-[18px] h-[18px]"} />
        </span>
      </div>

      <p className={cn(
        "mt-2 font-bold tabular-nums tracking-tight text-slate-900",
        isHero ? "text-[26px] leading-8" : compact ? "text-xl leading-7" : "text-2xl leading-8",
      )}>
        {format === "money" && shouldShowBankTransfers
          ? formatSelectedCurrency(displayedValue, selectedCode)
          : formatValue(displayedValue, format)}
      </p>

      {displayedSubtitle && (
        <p className="mt-1 text-[11px] leading-tight text-slate-400 truncate" title={displayedSubtitle}>
          {displayedSubtitle}
        </p>
      )}
    </div>
  );

  if (!shouldShowBankTransfers) return mainCard;

  return (
    <>
      {mainCard}
      <div className={shell}>
        <span className={cn("absolute inset-y-0 start-0 w-1 opacity-70", ACCENT_CLASSES.blue.rail)} aria-hidden />
        <div className="flex items-start justify-between gap-3 min-w-0">
          <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-500">الحوالات البنكية</p>
          <span className="shrink-0 rounded-lg bg-blue-50 p-1.5 text-blue-600"><Icon className="w-[18px] h-[18px]" /></span>
        </div>
        <p className="mt-2 text-2xl font-bold leading-8 tabular-nums tracking-tight text-slate-900">
          {formatSelectedCurrency(bankDisplayValue, selectedCode)}
        </p>
        <p className="mt-1 truncate text-[11px] leading-tight text-slate-400">
          الأصل: {currencyBreakdown(bankSummary?.totals)} • معتمد: {bankSummary?.approvedCount ?? 0} • مراجعة: {bankSummary?.pendingCount ?? 0}
        </p>
      </div>
    </>
  );
}
