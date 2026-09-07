"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, CircleDashed, Clipboard, Loader2, XCircle } from "lucide-react";
import { INTEGRATION_UI_STATUS_LABEL, type IntegrationUiStatus } from "@/lib/integration-settings/ui";
import { cn } from "@/lib/utils";

/**
 * Shared surface primitives for مزودو التواصل والإرسال.
 *
 * The page had grown three separate visual languages for the same idea — a
 * status chip in the provider card, a differently-shaped one in `ui.tsx`, and a
 * third full-width tinted box for test results — plus two byte-identical blue
 * webhook panels. Everything was also set in `font-black`, from card titles down
 * to helper text, so nothing looked more important than anything else.
 *
 * These primitives fix the vocabulary in one place:
 *  - radii: panels `rounded-xl`, blocks inside them `rounded-lg`, code `rounded-md`
 *  - weight: `font-semibold` for headings, `font-medium` for labels, never `font-black`
 *  - colour: the `brand` scale for brand blue (the file was full of raw `blue-*`,
 *    which is a different hue from `#025EB8` and visibly clashed with it);
 *    emerald / amber / rose stay reserved for status meaning.
 */

/* ---------------------------------- status --------------------------------- */

type Tone = "success" | "pending" | "danger" | "neutral" | "info";

const STATUS_TONE: Record<IntegrationUiStatus, Tone> = {
  READY: "success",
  PENDING_ACTIVATION: "info",
  PENDING_TEST: "pending",
  NEEDS_SETUP: "neutral",
  TEST_FAILED: "danger",
  DISABLED: "neutral",
  ENCRYPTION_ERROR: "danger",
  ENCRYPTION_KEY_MISSING: "danger",
};

const TONE_CHIP: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-brand-200 bg-brand-50 text-brand-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
};

const TONE_DOT: Record<Tone, string> = {
  success: "bg-emerald-500",
  pending: "bg-amber-400",
  danger: "bg-rose-500",
  info: "bg-brand-500",
  neutral: "bg-slate-300",
};

/**
 * One chip for all eight states. The previous card collapsed them into a binary
 * check/alert icon, so "معطل", "يحتاج إعداد" and "فشل الاختبار" were
 * indistinguishable at a glance despite meaning very different things.
 */
export function StatusChip({ status, className }: { status: IntegrationUiStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
        TONE_CHIP[tone],
        className
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
      {INTEGRATION_UI_STATUS_LABEL[status]}
    </span>
  );
}

/* ---------------------------------- panels --------------------------------- */

/**
 * Brand-tinted block for webhook URLs and route info. Replaces two duplicated
 * `border-blue-200 bg-blue-50` boxes that had drifted apart in padding.
 */
export function InfoPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-brand-200 bg-brand-50/60 p-4", className)}>
      <p className="text-sm font-semibold text-brand-900">{title}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-brand-800/80">{description}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

const BANNER_TONE: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-brand-200 bg-brand-50 text-brand-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

const BANNER_ICON: Record<Tone, typeof CheckCircle2> = {
  success: CheckCircle2,
  pending: CircleAlert,
  danger: XCircle,
  info: CircleAlert,
  neutral: CircleDashed,
};

/** Notices and test results now share one shape instead of two lookalike boxes. */
export function Banner({
  tone,
  title,
  children,
  meta,
  role = "status",
}: {
  tone: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  meta?: React.ReactNode;
  /** "alert" for blocking configuration problems, "status" for results. */
  role?: "status" | "alert";
}) {
  const Icon = BANNER_ICON[tone];
  return (
    <div role={role} className={cn("flex items-start gap-2.5 rounded-lg border p-3", BANNER_TONE[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm leading-6">{children}</div> : null}
        {meta ? <p className="mt-1 text-[11px] opacity-70">{meta}</p> : null}
      </div>
    </div>
  );
}

/* ---------------------------------- pieces --------------------------------- */

/** A read-only path/URL with its copy button — was hand-rolled in three places. */
export function CopyableCode({
  value,
  onCopy,
  copyLabel = "نسخ الرابط",
  className,
}: {
  value: string;
  onCopy: () => void;
  copyLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" dir="ltr">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <Clipboard className="h-3.5 w-3.5" />
        {copyLabel}
      </button>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/**
 * Completion meter for a provider card. A bar reads at a glance where
 * "الإعدادات المكتملة: 3/5" needed parsing.
 */
export function CompletionMeter({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const done = total > 0 && completed >= total;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-500">الإعدادات المكتملة</span>
        {/* dir="ltr" so bidi reordering can't render "1/6" as "6/1". */}
        <span className="font-semibold tabular-nums text-slate-700" dir="ltr">
          {completed}/{total}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : "bg-brand-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* --------------------------------- buttons --------------------------------- */

type ActionVariant = "primary" | "success" | "danger" | "secondary";

const ACTION_VARIANT: Record<ActionVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-700",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
};

/**
 * The old version styled its default state as blue-on-white, so every secondary
 * action competed with the one primary action. Secondary is neutral now.
 */
export function ActionButton({
  disabled,
  loading,
  onClick,
  icon,
  label,
  variant = "secondary",
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: ActionVariant;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        ACTION_VARIANT[variant]
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
