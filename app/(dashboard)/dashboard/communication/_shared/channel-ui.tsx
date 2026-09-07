"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, Eye, RefreshCw, SlashIcon, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual language shared by the البريد / واتساب / SMS channel pages.
 *
 * Each channel has its own lifecycle vocabulary — email is opened, WhatsApp is read, SMS is
 * merely delivered — but the *shape* of the question is identical: how far along the ladder did
 * this message get, and is a missing rung a "no" or an "unknown"? Keeping that judgement in one
 * place is what stops three pages from quietly answering it three different ways.
 */

export type JourneyStage = {
  key: string;
  label: string;
  at: string | null;
  icon: LucideIcon;
  /** Stages known from our own records, not the provider's — never rendered as "unknown". */
  local?: boolean;
};

/**
 * The timestamps a lifecycle strip is built from.
 *
 * Both the paged table row and the full record fetched for the preview satisfy this, so one
 * `buildStages` per channel serves both and the two views cannot drift apart. Channel-specific
 * rungs are optional because email has no `readAt` and WhatsApp has no `openedAt`.
 */
export type StageSource = {
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
};

export type StageBuilder = (row: StageSource) => JourneyStage[];

export function fmtDateTime(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "Europe/Istanbul" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/Istanbul" }),
  };
}

export function fmtFull(value: string | null): string {
  const dt = fmtDateTime(value);
  return dt ? `${dt.date} · ${dt.time}` : "—";
}

/**
 * How far each rung is worth trusting, as a visual step up.
 *
 * "Handed to the provider" is the weakest claim we can make and stays grey; each confirmed step
 * beyond it earns more colour, so a column of these reads as a gradient of certainty rather than a
 * row of equally-loud badges.
 */
const STAGE_TONES = [
  "border-slate-200 bg-slate-50 text-slate-600",
  "border-sky-200 bg-sky-50 text-sky-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-brand/25 bg-brand/10 text-brand",
];

/**
 * The furthest point a message reached, as one badge.
 *
 * This replaced a strip of four pips. The pips showed every rung at once, which meant the reader
 * had to decode four shapes to answer the only question they actually had — what happened to this
 * message? A single "قُرئ ✓✓" says it directly, and the full ladder with timestamps is still one
 * hover (or one معاينة click) away.
 *
 * The one nuance kept from the pips: when the provider has never reported an event, the badge is
 * dashed. Rendering a confident "أُرسل" in that state would let "we aren't receiving tracking"
 * masquerade as "it was sent and nothing further happened" — opposite meanings, same pixels.
 */
export function DeliveryStatusPill({
  stages,
  failed,
  skipped,
  errorMessage,
  trackingLive,
}: {
  stages: JourneyStage[];
  failed?: boolean;
  skipped?: boolean;
  errorMessage?: string | null;
  trackingLive: boolean;
}) {
  if (failed) {
    return (
      <span
        title={errorMessage ?? "فشل الإرسال"}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        فشل
      </span>
    );
  }

  if (skipped) {
    return (
      <span
        title={errorMessage ?? "تم تخطّي هذه الرسالة قبل الإرسال."}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500"
      >
        <SlashIcon className="h-3.5 w-3.5 shrink-0" />
        لم تُرسل
      </span>
    );
  }

  // Walk forward, not backward: a provider can confirm a read without ever sending a delivery
  // event, and taking the *last* truthy rung keeps that ahead of the ones it skipped.
  let reached = 0;
  for (let i = 0; i < stages.length; i++) if (stages[i].at) reached = i;

  const stage = stages[reached];
  const Icon = stage.icon;
  const blind = !trackingLive && reached === 0;
  const tone = STAGE_TONES[Math.min(reached, STAGE_TONES.length - 1)];

  // Hovering gives back everything the pips used to show, without spending width on it.
  const tooltip = stages
    .map((s) => `${s.label}: ${s.at ? fmtFull(s.at) : blind && !s.local ? "لا توجد بيانات" : "—"}`)
    .join("\n");

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold",
        tone,
        blind && "border-dashed",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {stage.label}
      {blind && <span className="text-slate-400">؟</span>}
    </span>
  );
}

/** Short Arabic origin labels. The raw enum ("TRIGGER") leaked English into an RTL table. */
export const ORIGIN_LABELS: Record<string, string> = {
  TRIGGER: "تلقائي",
  MANUAL: "يدوي",
  CAMPAIGN: "حملة",
  TEST: "تجربة",
  REACTIVATION: "إعادة تفعيل",
  SYSTEM: "النظام",
};

/**
 * The recipient cell — a button into the donor profile card whenever we know who they are.
 *
 * Matches سجل الرسائل: same drawer, same affordance. Rows without a `recipientUserId` render as
 * plain text rather than a dead button, so a control that looks pressable always is.
 */
export function RecipientCell({
  userId,
  name,
  contact,
  onOpenProfile,
}: {
  userId: string | null;
  name: string | null;
  contact: string | null;
  onOpenProfile: (userId: string) => void;
}) {
  const label = name || contact || "—";
  const sub = name && contact ? contact : null;

  const body = (
    <>
      <span className="block truncate font-semibold text-slate-800 group-hover:text-brand">{label}</span>
      {sub && <span className="block truncate text-[11px] text-slate-400" dir="ltr">{sub}</span>}
    </>
  );

  if (!userId) {
    return <div className="max-w-[220px] leading-tight">{body}</div>;
  }

  return (
    <button
      type="button"
      // The row itself opens the preview, so this must not bubble.
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile(userId);
      }}
      title="عرض ملف المتبرّع"
      className="group -mx-1 block max-w-[220px] cursor-pointer rounded-md px-1 py-0.5 text-right leading-tight transition-colors hover:bg-brand/8"
    >
      {body}
    </button>
  );
}

export type FunnelStep = {
  label: string;
  value: number;
  pct: number;
  tone: string;
  /** Known without provider feedback — shown even when tracking is dark. */
  always?: boolean;
};

/** Lifecycle stages as proportional bars, so drop-off is seen rather than calculated. */
export function FunnelCard({
  steps,
  trackingLive,
  title = "مسار الرسالة",
  caption = "من إجمالي المقبول",
}: {
  steps: FunnelStep[];
  trackingLive: boolean;
  title?: string;
  caption?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
        <span className="text-[11px] text-slate-400">{caption}</span>
      </div>
      <div className="space-y-2.5">
        {steps.map((step) => {
          const blind = !step.always && !trackingLive;
          return (
            <div key={step.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600">{step.label}</span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {blind ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <>
                      <b className="text-slate-900">{step.value.toLocaleString("en-US")}</b>
                      {!step.always && <span className="ms-1 text-slate-400">{step.pct}%</span>}
                    </>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${blind ? 0 : Math.min(100, step.pct)}%`, backgroundColor: step.tone }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Says "we are not receiving events" so an empty funnel is never mistaken for disengagement. */
export function TrackingBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="text-xs leading-5 text-amber-900">{children}</div>
    </div>
  );
}

/**
 * Whether a row may be re-sent.
 *
 * Kept here rather than in each table so the button's presence and the server's decision are read
 * from the same rule — a row offering a retry the API then refuses is worse than no button at all.
 * BOUNCED is intentionally absent: re-sending to an address that bounced only accrues bounce rate.
 */
export function isRetryable(row: { status: string; retriedAt?: string | null }): boolean {
  return (row.status === "FAILED" || row.status === "SKIPPED") && !row.retriedAt;
}

/** Per-row actions: preview always, retry only where it would actually be honoured. */
export function RowActions({
  row,
  onPreview,
  onRetry,
}: {
  row: { status: string; retriedAt?: string | null };
  onPreview: () => void;
  onRetry: () => void;
}) {
  const retryable = isRetryable(row);
  // Row clicks open the preview, so every button here must stop the event reaching the <tr>.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {row.retriedAt && (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          أُعيد إرساله
        </span>
      )}
      {retryable && (
        <button
          type="button"
          onClick={stop(onRetry)}
          title="إعادة الإرسال"
          aria-label="إعادة الإرسال"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-brand/8 hover:text-brand"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={stop(onPreview)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-brand transition hover:bg-brand/8"
      >
        <Eye className="h-3.5 w-3.5" />
        معاينة
      </button>
    </div>
  );
}

/** Period / status segmented control used across the channel pages. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
            value === option.value ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
