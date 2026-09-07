"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ShieldOff,
  MailX, FileWarning, Ban, TriangleAlert, PartyPopper,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Re-sending messages that never went out.
 *
 * The dialog is three screens in one because a send is irreversible: state plainly what is about to
 * happen, show it happening, then account for every message afterwards. The final report is the
 * point — a spinner that just disappears leaves an operator with no idea whether twenty donors were
 * emailed or none were, and no way to find out.
 */

type Phase = "confirm" | "running" | "report";

type RetryResult = {
  deliveryId: string;
  code: string;
  ok: boolean;
  message: string;
  detail?: string | null;
  recipient?: string | null;
  recipientName?: string | null;
};

type Summary = { total: number; sent: number; failed: number; byCode: Record<string, number> };

type Preflight = {
  eligible: number;
  alreadyRetried: number;
  bounced: number;
  cap: number;
  oldestDays: number | null;
  byReason: Array<{ reason: string; count: number }>;
};

/** Outcome vocabulary. Every code the service can return has a row here so nothing renders raw. */
const CODE_META: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  SENT: { label: "أُرسلت", icon: CheckCircle2, tone: "text-emerald-600" },
  PROVIDER_REJECTED: { label: "رفضها المزوّد", icon: XCircle, tone: "text-rose-600" },
  CONSENT_BLOCKED: { label: "بدون موافقة", icon: ShieldOff, tone: "text-amber-600" },
  NO_RECIPIENT: { label: "بدون عنوان", icon: MailX, tone: "text-amber-600" },
  NO_RENDERED_BODY: { label: "بدون محتوى محفوظ", icon: FileWarning, tone: "text-amber-600" },
  META_TEMPLATE_REQUIRED: { label: "يحتاج قالبًا معتمدًا", icon: FileWarning, tone: "text-amber-600" },
  NO_SENDER_IDENTITY: { label: "بدون هوية مُرسِل", icon: FileWarning, tone: "text-amber-600" },
  ALREADY_RETRIED: { label: "أُعيد إرسالها من قبل", icon: Clock, tone: "text-slate-500" },
  NOT_RETRYABLE_BOUNCED: { label: "عنوان مرتدّ", icon: Ban, tone: "text-rose-600" },
  NOT_RETRYABLE_STATUS: { label: "حالة غير قابلة للإعادة", icon: Ban, tone: "text-slate-500" },
  NOT_FOUND: { label: "غير موجودة", icon: Ban, tone: "text-slate-500" },
  ARCHIVE_FAILED: { label: "تعذّر التسجيل", icon: XCircle, tone: "text-rose-600" },
};

const meta = (code: string) => CODE_META[code] ?? { label: code, icon: AlertTriangle, tone: "text-slate-500" };

type Props = {
  open: boolean;
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  /** Explicit ids for a targeted retry; null runs the backlog for the current period. */
  ids: string[] | null;
  days: number;
  onOpenChange: (open: boolean) => void;
  /** Fired once after a run that sent at least one message, so the table can refresh. */
  onFinished: () => void;
};

export function RetryDialog({ open, channel, ids, days, onOpenChange, onFinished }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [results, setResults] = useState<RetryResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const sentAnything = useRef(false);

  const isBulk = ids === null;

  // Reset on each open so a second run never inherits the previous report.
  useEffect(() => {
    if (!open) return;
    setPhase("confirm");
    setError(null);
    setDone(0);
    setTotal(0);
    setCurrent(null);
    setResults([]);
    setSummary(null);
    sentAnything.current = false;

    if (!isBulk) {
      setPreflight(null);
      return;
    }
    setLoadingPreflight(true);
    fetch(`/api/dashboard/communication/deliveries/retry?channel=${channel}&days=${days}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر حساب الرسائل");
        setPreflight(json);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingPreflight(false));
  }, [open, channel, days, isBulk]);

  const run = useCallback(async () => {
    setPhase("running");
    setError(null);
    try {
      const res = await fetch("/api/dashboard/communication/deliveries/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ids: ids ?? undefined, days: isBulk ? days : undefined }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "تعذّر بدء إعادة الإرسال");
      }

      // NDJSON: one JSON object per line. The tail of a chunk is usually a partial line, so it is
      // carried over rather than parsed — dropping it would silently lose whole results.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "start") {
            setTotal(Number(event.total) || 0);
          } else if (event.type === "progress") {
            const result = event.result as RetryResult;
            setDone(Number(event.index) || 0);
            setCurrent(result.recipientName || result.recipient || null);
            setResults((prev) => [result, ...prev]);
            if (result.ok) sentAnything.current = true;
          } else if (event.type === "done") {
            setSummary(event.summary as Summary);
            setPhase("report");
          } else if (event.type === "error") {
            throw new Error(String(event.error));
          }
        }
      }
      // A stream that ends without a `done` event means the run was cut short mid-flight.
      setPhase((p) => (p === "running" ? "report" : p));
    } catch (e) {
      setError((e as Error).message);
      setPhase("report");
    }
  }, [channel, ids, days, isBulk]);

  const close = useCallback(() => {
    if (phase === "running") return; // a send in flight must not be orphaned by a stray click
    if (sentAnything.current) onFinished();
    onOpenChange(false);
  }, [phase, onFinished, onOpenChange]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nothingToDo = isBulk && preflight != null && preflight.eligible === 0;
  const willSend = isBulk ? Math.min(preflight?.eligible ?? 0, preflight?.cap ?? 25) : ids?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent dir="rtl" className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-right">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <RefreshCw className={cn("h-4 w-4", phase === "running" && "animate-spin")} />
            </span>
            {phase === "report" ? "نتيجة إعادة الإرسال" : "إعادة إرسال الرسائل"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-5">
          {phase === "confirm" && (
            <ConfirmStep
              isBulk={isBulk}
              count={willSend}
              channel={channel}
              days={days}
              preflight={preflight}
              loading={loadingPreflight}
              error={error}
            />
          )}

          {phase === "running" && (
            <RunningStep pct={pct} done={done} total={total} current={current} results={results} />
          )}

          {phase === "report" && (
            <ReportStep summary={summary} results={results} error={error} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3.5">
          <span className="text-[11px] text-slate-400">
            {phase === "running" ? "لا تُغلق النافذة أثناء الإرسال" : phase === "confirm" && !nothingToDo ? "لا يمكن التراجع بعد الإرسال" : ""}
          </span>
          <div className="flex gap-2">
            {phase === "confirm" && (
              <>
                <Button variant="ghost" size="sm" onClick={close}>إلغاء</Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={loadingPreflight || nothingToDo || willSend === 0 || Boolean(error)}
                  onClick={() => void run()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {willSend > 0 ? `إرسال ${willSend.toLocaleString("en-US")} رسالة` : "إرسال"}
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button size="sm" disabled className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                جارٍ الإرسال…
              </Button>
            )}
            {phase === "report" && <Button size="sm" onClick={close}>تمّ</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmStep({
  isBulk, count, channel, days, preflight, loading, error,
}: {
  isBulk: boolean;
  count: number;
  channel: string;
  days: number;
  preflight: Preflight | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>;
  }
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!isBulk) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-700">
          سيُعاد إرسال هذه الرسالة بنفس المحتوى المحفوظ، إلى العنوان المسجّل للمستلم الآن.
        </p>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
          تُنشأ محاولة جديدة مستقلة — لا يُعدَّل سجل المحاولة الفاشلة، حتى تبقى إحصاءات الفشل السابقة كما هي.
        </p>
      </div>
    );
  }

  if (!preflight || preflight.eligible === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        <p className="text-sm font-semibold text-slate-800">لا توجد رسائل بحاجة لإعادة إرسال</p>
        <p className="text-xs text-slate-500">كل رسائل هذه الفترة إمّا أُرسلت أو أُعيد إرسالها من قبل.</p>
      </div>
    );
  }

  const capped = preflight.eligible > preflight.cap;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-slate-900">{count.toLocaleString("en-US")}</span>
          <span className="text-sm text-slate-600">
            رسالة {channel === "EMAIL" ? "بريد" : channel === "WHATSAPP" ? "واتساب" : "نصية"} ستُرسل الآن
          </span>
        </div>
        {capped && (
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            من أصل {preflight.eligible.toLocaleString("en-US")} رسالة قابلة لإعادة الإرسال خلال آخر {days} يومًا.
            تُرسل على دفعات من {preflight.cap} — كرّر العملية لإكمال الباقي.
          </p>
        )}
      </div>

      {/* Age is the warning that matters most here. These are mostly receipts, and a receipt that
          lands months after the donation reads to the donor as a fresh charge. */}
      {preflight.oldestDays != null && preflight.oldestDays >= 7 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs leading-5 text-amber-900">
            <b>أقدم رسالة عمرها {preflight.oldestDays.toLocaleString("en-US")} يومًا.</b>{" "}
            الرسائل التشغيلية (إيصالات التبرّع مثلًا) قد تبدو للمستلم وكأنها عن عملية جديدة. راجع
            المحتوى بـ«معاينة» قبل الإرسال، أو جرّب رسالة واحدة أولًا.
          </div>
        </div>
      )}

      {preflight.byReason.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">سبب عدم الإرسال أصلًا</h4>
          <div className="space-y-1">
            {preflight.byReason.slice(0, 6).map((r) => (
              <div key={r.reason} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="truncate text-[11px] text-slate-600" dir="ltr" title={r.reason}>{r.reason}</span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-700">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(preflight.bounced > 0 || preflight.alreadyRetried > 0) && (
        <p className="text-[11px] leading-5 text-slate-500">
          {preflight.bounced > 0 && (
            <>مستثنى: {preflight.bounced} رسالة مرتدّة (إعادة الإرسال لعنوان مرتدّ تضرّ بسمعة النطاق). </>
          )}
          {preflight.alreadyRetried > 0 && <>{preflight.alreadyRetried} رسالة أُعيد إرسالها من قبل.</>}
        </p>
      )}
    </div>
  );
}

function RunningStep({
  pct, done, total, current, results,
}: {
  pct: number;
  done: number;
  total: number;
  current: string | null;
  results: RetryResult[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
            <circle
              cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
              className="text-brand transition-[stroke-dashoffset] duration-500"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - pct / 100)}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-lg font-bold tabular-nums text-slate-900">{done}</span>
            <span className="text-[10px] text-slate-400">من {total}</span>
          </div>
        </div>
        <p className="h-4 truncate text-xs text-slate-500" dir="auto">
          {current ? `جارٍ الإرسال إلى ${current}` : "جارٍ التحضير…"}
        </p>
      </div>

      <div className="space-y-1">
        {results.slice(0, 8).map((r, i) => {
          const m = meta(r.code);
          const Icon = m.icon;
          return (
            <div
              key={`${r.deliveryId}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-[11px]"
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", m.tone)} />
              <span className="min-w-0 flex-1 truncate text-slate-700" dir="auto">
                {r.recipientName || r.recipient || r.deliveryId}
              </span>
              <span className={cn("shrink-0 font-semibold", m.tone)}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportStep({
  summary, results, error,
}: {
  summary: Summary | null;
  results: RetryResult[];
  error: string | null;
}) {
  const sent = summary?.sent ?? results.filter((r) => r.ok).length;
  const failed = summary?.failed ?? results.filter((r) => !r.ok).length;
  const byCode = summary?.byCode ?? results.reduce<Record<string, number>>((acc, r) => {
    acc[r.code] = (acc[r.code] ?? 0) + 1;
    return acc;
  }, {});
  const problems = results.filter((r) => !r.ok);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs leading-5 text-rose-900">
          <b className="block">توقّفت العملية قبل اكتمالها</b>
          {error}
          {results.length > 0 && " — النتائج أدناه تخصّ ما تمّ فعلًا قبل التوقّف."}
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        {sent > 0 ? (
          <PartyPopper className="h-8 w-8 shrink-0 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-8 w-8 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {sent > 0 ? `أُرسلت ${sent.toLocaleString("en-US")} رسالة بنجاح` : "لم تُرسل أي رسالة"}
          </p>
          <p className="text-[11px] text-slate-500">
            {failed > 0 ? `${failed.toLocaleString("en-US")} لم تُرسل — التفصيل بالأسفل.` : "اكتملت كل الرسائل دون مشاكل."}
          </p>
        </div>
      </div>

      {Object.keys(byCode).length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(byCode)
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => {
              const m = meta(code);
              const Icon = m.icon;
              return (
                <div key={code} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", m.tone)} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{m.label}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{count}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* The unsent ones, named. A count alone tells an operator something went wrong but not to
          whom, and these are exactly the rows they need to go look at next. */}
      {problems.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">الرسائل التي لم تُرسل</h4>
          <div className="max-h-52 space-y-1 overflow-auto">
            {problems.map((r, i) => {
              const m = meta(r.code);
              return (
                <div key={`${r.deliveryId}-${i}`} className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-slate-700" dir="auto">
                      {r.recipientName || r.recipient || r.deliveryId}
                    </span>
                    <span className={cn("shrink-0 font-semibold", m.tone)}>{m.label}</span>
                  </div>
                  {r.detail && (
                    <p className="mt-0.5 truncate text-[10px] text-slate-400" dir="ltr" title={r.detail}>{r.detail}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
