import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type SummaryStat = {
  label: string;
  value: string;
  /** Small mark beside the label — a silhouette to scan for, not decoration. */
  icon?: LucideIcon;
  /** Optional delta, e.g. "+12.4%". Colour is chosen from `trend`. */
  delta?: string;
  trend?: "up" | "down" | "flat";
  /** Short qualifier printed beside the value. Keep it to a couple of words. */
  hint?: string;
};

type Props = {
  /** Small uppercase label above the headline figure. */
  eyebrow: string;
  /** The one number this page exists to report. */
  value: string;
  /** Clarifies scope, e.g. "لا تتأثر بالفترة أو التصفية". Surfaced on the info affordance. */
  note?: string;
  /** Secondary figures, shown inline to the side. */
  stats?: SummaryStat[];
  /** Badge on the eyebrow row, e.g. "كل الوقت" — states the figure's scope at a glance. */
  badge?: string;
  /** Mark on the icon tile. */
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
};

const TREND_CLASS: Record<NonNullable<SummaryStat["trend"]>, string> = {
  up: "text-emerald-600",
  down: "text-rose-600",
  flat: "text-slate-400",
};

/**
 * The headline band for an analytics page — one row, roughly 80px tall.
 *
 * Everything sits on a single baseline pair: the label row and the figure row. The secondary
 * figures repeat that rhythm to the side, separated by hairlines rather than wrapped in cards,
 * because four bordered boxes cost three times the height and read as a second toolbar rather
 * than as context for the number they belong to.
 *
 * The scope note is attached to an info affordance instead of a third line of text — it is
 * clarification, not content, and a permanent line of small print pushes the page's actual
 * content below the fold. It stays reachable by pointer (title) and by screen reader (sr-only).
 *
 * The wash is decorative only. Every value is slate-900 on white, so contrast never depends on
 * where the gradient happens to land.
 */
export function MetricSummaryBand({
  eyebrow,
  value,
  note,
  stats,
  badge,
  icon: Icon,
  children,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-slate-200/90 bg-white",
        "shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-18px_rgba(2,94,184,0.35)]",
        className,
      )}
    >
      {/* Decorative only — pointer-events-none so it can never eat a click. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(110%_140%_at_100%_0%,rgba(2,94,184,0.07),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-l from-transparent via-brand/35 to-transparent"
      />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        {/* Headline: label row over figure row. */}
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-[0_4px_12px_-4px_rgba(2,94,184,0.6)]">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                {eyebrow}
              </p>
              {badge && (
                <span className="shrink-0 rounded-full border border-brand/20 bg-brand/8 px-2 py-0.5 text-[10px] font-semibold text-brand">
                  {badge}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[30px] font-bold leading-tight tabular-nums tracking-tight text-slate-900 sm:text-[34px]">
              {value}
            </p>
          </div>
        </div>

        {/* Secondary figures — hairline-separated, same two-line rhythm as the headline. */}
        {stats && stats.length > 0 && (
          <div className="ms-auto flex flex-wrap items-center gap-y-3">
            {stats.map((stat) => {
              const StatIcon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="border-s border-slate-200 px-5 first:border-s-0 first:ps-0 last:pe-0"
                >
                  <div className="flex items-center gap-1.5">
                    {StatIcon && <StatIcon className="h-3.5 w-3.5 shrink-0 text-brand/70" />}
                    <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">
                      {stat.label}
                    </p>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <p className="text-[19px] font-bold leading-tight tabular-nums text-slate-900">
                      {stat.value}
                    </p>
                    {stat.delta && (
                      <span
                        className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          TREND_CLASS[stat.trend ?? "flat"],
                        )}
                      >
                        {stat.delta}
                      </span>
                    )}
                    {stat.hint && (
                      <span className="whitespace-nowrap text-[10px] text-slate-400">
                        {stat.hint}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {children && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </section>
  );
}
