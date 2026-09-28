"use client";

import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/context/CurrencyContext";
import { DASHBOARD_DISPLAY_SYMBOLS } from "@/lib/dashboard/format-dashboard-money";

type Accent = "emerald" | "teal" | "amber" | "orange" | "violet" | "indigo" | "slate" | "blue" | "rose" | "sky";
// Saturated accents: a solid gradient icon tile with a tinted glow, a full-strength rail and a
// faint wash of the same hue across the card. The pale-50 tiles and 70%-opacity rails used
// before made every card read as the same grey, so the accent carried no information.
// Class strings stay literal so Tailwind's scanner can see them.
const ACCENT_CLASSES: Record<Accent, { tile: string; wash: string; rail: string }> = {
  emerald: { tile: "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40", wash: "from-emerald-50", rail: "bg-emerald-500" },
  teal: { tile: "bg-gradient-to-br from-teal-400 to-teal-600 shadow-teal-500/40", wash: "from-teal-50", rail: "bg-teal-500" },
  amber: { tile: "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/40", wash: "from-amber-50", rail: "bg-amber-500" },
  orange: { tile: "bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-500/40", wash: "from-orange-50", rail: "bg-orange-500" },
  violet: { tile: "bg-gradient-to-br from-violet-400 to-violet-600 shadow-violet-500/40", wash: "from-violet-50", rail: "bg-violet-500" },
  indigo: { tile: "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/40", wash: "from-indigo-50", rail: "bg-indigo-500" },
  slate: { tile: "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-500/40", wash: "from-slate-100", rail: "bg-slate-500" },
  blue: { tile: "bg-gradient-to-br from-blue-500 to-brand shadow-blue-500/40", wash: "from-blue-50", rail: "bg-brand" },
  rose: { tile: "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/40", wash: "from-rose-50", rail: "bg-rose-500" },
  sky: { tile: "bg-gradient-to-br from-sky-400 to-sky-600 shadow-sky-500/40", wash: "from-sky-50", rail: "bg-sky-500" },
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
    "group relative isolate overflow-hidden rounded-xl border border-slate-200 bg-white",
    "shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-all duration-200",
    "hover:shadow-[0_6px_20px_rgba(16,24,40,0.10)] hover:border-slate-300 hover:-translate-y-px",
    compact ? "p-3.5" : "p-4",
    isHero && "ring-2 ring-brand/30 border-brand/40",
  );

  const Wash = ({ from }: { from: string }) => (
    <span className={cn("pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b to-white to-70%", from)} aria-hidden />
  );
  const Rail = () => (
    <span className={cn("absolute inset-y-0 start-0 w-1", colors.rail)} aria-hidden />
  );

  const mainCard = (
    <div className={shell}>
      <Wash from={colors.wash} />
      <Rail />
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p className={cn(
          "min-w-0 flex-1 font-semibold leading-snug text-slate-600",
          compact ? "text-[11.5px]" : "text-xs",
        )}>
          {shouldShowBankTransfers ? "إجمالي الإيرادات: الموقع + الحسابات البنكية" : title}
        </p>
        <span className={cn("shrink-0 rounded-lg p-1.5 text-white shadow-md transition-transform group-hover:scale-105", colors.tile)}>
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
        <p className="mt-1 text-[11px] leading-tight text-slate-500 truncate" title={displayedSubtitle}>
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
        <Wash from={ACCENT_CLASSES.blue.wash} />
        <span className={cn("absolute inset-y-0 start-0 w-1", ACCENT_CLASSES.blue.rail)} aria-hidden />
        <div className="flex items-start justify-between gap-3 min-w-0">
          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-600">الحوالات البنكية</p>
          <span className={cn("shrink-0 rounded-lg p-1.5 text-white shadow-md", ACCENT_CLASSES.blue.tile)}><Icon className="w-[18px] h-[18px]" /></span>
        </div>
        <p className="mt-2 text-2xl font-bold leading-8 tabular-nums tracking-tight text-slate-900">
          {formatSelectedCurrency(bankDisplayValue, selectedCode)}
        </p>
        <p className="mt-1 truncate text-[11px] leading-tight text-slate-500">
          الأصل: {currencyBreakdown(bankSummary?.totals)} • معتمد: {bankSummary?.approvedCount ?? 0} • مراجعة: {bankSummary?.pendingCount ?? 0}
        </p>
      </div>
    </>
  );
}
