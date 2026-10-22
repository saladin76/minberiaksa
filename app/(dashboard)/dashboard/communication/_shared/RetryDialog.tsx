"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ShieldOff,
  MailX, FileWarning, Ban, TriangleAlert, PartyPopper,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

/**
 * Re-sending messages that never went out.
 *
 * The dialog is three screens in one because a send is irreversible: state plainly what is about to
 * happen, show it happening, then account for every message afterwards. The final report is the
 * point  a spinner that just disappears leaves an operator with no idea whether twenty donors were
 * emailed or none were, and no way to find out.
 */

type Phase = "confirm" | "running" | "report";
type RetryCursor = { id: string; createdAt: string };
const MAX_REPORTED_FAILURES = 200;

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
  range: { from: string | null; to: string };
};

/** Outcome vocabulary. Every code the service can return has a row here so nothing renders raw. */
const CODE_META: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  SENT: { get label() { return dt("أُرسلت"); }, icon: CheckCircle2, tone: "text-emerald-600" },
  PROVIDER_REJECTED: { get label() { return dt("رفضها المزوّد"); }, icon: XCircle, tone: "text-rose-600" },
  CONSENT_BLOCKED: { get label() { return dt("بدون موافقة"); }, icon: ShieldOff, tone: "text-amber-600" },
  NO_RECIPIENT: { get label() { return dt("بدون عنوان"); }, icon: MailX, tone: "text-amber-600" },
  NO_RENDERED_BODY: { get label() { return dt("بدون محتوى محفوظ"); }, icon: FileWarning, tone: "text-amber-600" },
  META_TEMPLATE_REQUIRED: { get label() { return dt("يحتاج قالبًا معتمدًا"); }, icon: FileWarning, tone: "text-amber-600" },
  NO_SENDER_IDENTITY: { get label() { return dt("بدون هوية مُرسِل"); }, icon: FileWarning, tone: "text-amber-600" },
  ALREADY_RETRIED: { get label() { return dt("أُعيد إرسالها من قبل"); }, icon: Clock, tone: "text-slate-500" },
  NOT_RETRYABLE_BOUNCED: { get label() { return dt("عنوان مرتدّ"); }, icon: Ban, tone: "text-rose-600" },
  NOT_RETRYABLE_STATUS: { get label() { return dt("حالة غير قابلة للإعادة"); }, icon: Ban, tone: "text-slate-500" },
  NOT_FOUND: { get label() { return dt("غير موجودة"); }, icon: Ban, tone: "text-slate-500" },
  ARCHIVE_FAILED: { get label() { return dt("تعذّر التسجيل"); }, icon: XCircle, tone: "text-rose-600" },
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
  const [recentResults, setRecentResults] = useState<RetryResult[]>([]);
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
    setRecentResults([]);
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
        if (!res.ok || !json.ok) throw new Error(json?.error || dt("تعذّر حساب الرسائل"));
        setPreflight(json);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingPreflight(false));
  }, [open, channel, days, isBulk]);

  const run = useCallback(async () => {
    setPhase("running");
    setError(null);
    setDone(0);
    setTotal(isBulk ? preflight?.eligible ?? 0 : 0);
    setCurrent(null);
    setResults([]);
    setRecentResults([]);
    const aggregate: Summary = { total: 0, sent: 0, failed: 0, byCode: {} };

    try {
      let cursor: RetryCursor | null = null;
      for (;;) {
        const res = await fetch("/api/dashboard/communication/deliveries/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            ids: ids ?? undefined,
            days: isBulk ? days : undefined,
            range: isBulk ? preflight?.range : undefined,
            ...(cursor ? { after: cursor } : {}),
          }),
        });
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || dt("تعذّر بدء إعادة الإرسال"));
        }

        // Each request stays bounded; the cursor advances even if a message is blocked, so one
        // unchanged failed row cannot trap the automatic walk at the front of the queue.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let batchCount = 0;
        let batchComplete = false;
        let batchHasMore = false;
        let nextCursor: RetryCursor | null = null;

        const consume = (line: string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "start") {
            if (!isBulk) setTotal(Number(event.total) || 0);
          } else if (event.type === "progress") {
            const result = event.result as RetryResult;
            batchCount += 1;
            aggregate.total += 1;
            if (result.ok) {
              aggregate.sent += 1;
              sentAnything.current = true;
            } else {
              aggregate.failed += 1;
              aggregate.byCode[result.code] = (aggregate.byCode[result.code] ?? 0) + 1;
              setResults((prev) => prev.length < MAX_REPORTED_FAILURES ? [result, ...prev] : prev);
            }
            if (result.ok) aggregate.byCode[result.code] = (aggregate.byCode[result.code] ?? 0) + 1;
            setDone((prev) => prev + 1);
            setCurrent(result.recipientName || result.recipient || null);
            setRecentResults((prev) => [result, ...prev].slice(0, 8));
          } else if (event.type === "done") {
            const batchSummary = event.summary as Summary | undefined;
            if (!batchSummary || Number(batchSummary.total) !== batchCount) {
              throw new Error(dt("لم يكتمل تسجيل نتائج دفعة إعادة الإرسال."));
            }
            batchHasMore = event.hasMore === true;
            const next = event.nextCursor as RetryCursor | null;
            if (next !== null && (!next || typeof next.id !== "string" || typeof next.createdAt !== "string")) {
              throw new Error(dt("تعذّر متابعة دفعات إعادة الإرسال."));
            }
            nextCursor = next;
            batchComplete = true;
          } else if (event.type === "error") {
            throw new Error(String(event.error));
          }
        };

        for (;;) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) consume(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        if (!batchComplete) throw new Error(dt("انقطع الاتصال قبل تأكيد اكتمال الدفعة."));
        if (batchHasMore && !nextCursor) throw new Error(dt("تعذّر متابعة دفعات إعادة الإرسال."));

        cursor = nextCursor;
        if (!isBulk || !batchHasMore) break;
      }

      setTotal(aggregate.total);
      setDone(aggregate.total);
      setSummary({ ...aggregate, byCode: { ...aggregate.byCode } });
      setPhase("report");
    } catch (e) {
      setError((e as Error).message);
      setSummary(aggregate.total > 0 ? { ...aggregate, byCode: { ...aggregate.byCode } } : null);
      setPhase("report");
    }
  }, [channel, ids, days, isBulk, preflight]);

  const close = useCallback(() => {
    if (phase === "running") return; // a send in flight must not be orphaned by a stray click
    if (sentAnything.current) onFinished();
    onOpenChange(false);
  }, [phase, onFinished, onOpenChange]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nothingToDo = isBulk && preflight != null && preflight.eligible === 0;
  const willSend = isBulk ? preflight?.eligible ?? 0 : ids?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent dir={dashDir()} className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-start">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <RefreshCw className={cn("h-4 w-4", phase === "running" && "animate-spin")} />
            </span>
            {phase === "report" ? dt("نتيجة إعادة الإرسال") : dt("إعادة محاولة الرسائل")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-5">
          {phase === "confirm" && (
            <ConfirmStep
              isBulk={isBulk}
              count={willSend}
              channel={channel}
              preflight={preflight}
              loading={loadingPreflight}
              error={error}
            />
          )}

          {phase === "running" && (
            <RunningStep pct={pct} done={done} total={total} current={current} results={recentResults} />
          )}

          {phase === "report" && (
            <ReportStep summary={summary} results={results} error={error} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3.5">
          <span className="text-[11px] text-slate-400">
            {phase === "running" ? dt("لا تُغلق النافذة أثناء الإرسال") : phase === "confirm" && !nothingToDo ? dt("لا يمكن التراجع بعد الإرسال") : ""}
          </span>
          <div className="flex gap-2">
            {phase === "confirm" && (
              <>
                <Button variant="ghost" size="sm" onClick={close}>{dt("إلغاء")}</Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={loadingPreflight || nothingToDo || willSend === 0 || Boolean(error)}
                  onClick={() => void run()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {willSend > 0 ? dt("إرسال {0} رسالة", [willSend.toLocaleString("en-US")]) : dt("إرسال")}
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button size="sm" disabled className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {dt("جارٍ الإرسال…")}</Button>
            )}
            {phase === "report" && <Button size="sm" onClick={close}>{dt("تمّ")}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmStep({
  isBulk, count, channel, preflight, loading, error,
}: {
  isBulk: boolean;
  count: number;
  channel: string;
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
          {dt("سيُعاد إرسال هذه الرسالة بنفس المحتوى المحفوظ، إلى العنوان المسجّل للمستلم الآن.")}</p>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
          {dt("تُنشأ محاولة جديدة مستقلة  لا يُعدَّل سجل المحاولة الفاشلة، حتى تبقى إحصاءات الفشل السابقة كما هي.")}</p>
      </div>
    );
  }

  if (!preflight || preflight.eligible === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        <p className="text-sm font-semibold text-slate-800">{dt("لا توجد رسائل بحاجة لإعادة إرسال")}</p>
        <p className="text-xs text-slate-500">{dt("كل رسائل هذه الفترة إمّا أُرسلت أو أُعيد إرسالها من قبل.")}</p>
      </div>
    );
  }

  const paged = preflight.eligible > preflight.cap;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-slate-900">{count.toLocaleString("en-US")}</span>
          <span className="text-sm text-slate-600">
            {dt("رسالة ")}{channel === "EMAIL" ? dt("بريد") : channel === "WHATSAPP" ? dt("واتساب") : dt("نصية")} {dt(" ستُراجع الآن")}</span>
        </div>
        {paged && (
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            {dtx("ستُعالج كل {0} محاولة تلقائيًا على دفعات متتابعة من {1} رسالة حتى تنتهي القائمة. يُرسل فقط ما يظل صالحًا بعد إعادة فحص المستلم والقالب وهوية المُرسل.", [preflight.eligible.toLocaleString("en-US"), preflight.cap])}</p>
        )}
      </div>

      {/* Age is the warning that matters most here. These are mostly receipts, and a receipt that
          lands months after the donation reads to the donor as a fresh charge. */}
      {preflight.oldestDays != null && preflight.oldestDays >= 7 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs leading-5 text-amber-900">
            <b>{dtx("أقدم رسالة عمرها {0} يومًا.", [preflight.oldestDays.toLocaleString("en-US")])}</b>{dt(" الرسائل التشغيلية (إيصالات التبرّع مثلًا) قد تبدو للمستلم وكأنها عن عملية جديدة. راجع المحتوى بـ«معاينة» قبل الإرسال، أو جرّب رسالة واحدة أولًا.")}</div>
        </div>
      )}

      {preflight.byReason.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{dt("سبب عدم الإرسال أصلًا")}</h4>
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
            <>{dtx("مستثنى: {0} رسالة مرتدّة (إعادة الإرسال لعنوان مرتدّ تضرّ بسمعة النطاق). ", [preflight.bounced])}</>
          )}
          {preflight.alreadyRetried > 0 && <>{dtx("{0} رسالة أُعيد إرسالها من قبل.", [preflight.alreadyRetried])}</>}
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
            <span className="text-[10px] text-slate-400">{dtx("من {0}", [total])}</span>
          </div>
        </div>
        <p className="h-4 truncate text-xs text-slate-500" dir="auto">
          {current ? dt("جارٍ الإرسال إلى {0}", [current]) : dt("جارٍ التحضير…")}
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
  const failed = summary?.failed ?? results.length;
  const byCode = summary?.byCode ?? results.reduce<Record<string, number>>((acc, r) => {
    acc[r.code] = (acc[r.code] ?? 0) + 1;
    return acc;
  }, {});
  const problems = results;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs leading-5 text-rose-900">
          <b className="block">{dt("توقّفت العملية قبل اكتمالها")}</b>
          {error}
          {results.length > 0 && dt("  النتائج أدناه تخصّ ما تمّ فعلًا قبل التوقّف.")}
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
            {sent > 0 ? dt("أُرسلت {0} رسالة بنجاح", [sent.toLocaleString("en-US")]) : dt("لم تُرسل أي رسالة")}
          </p>
          <p className="text-[11px] text-slate-500">
            {failed > 0 ? dt("{0} لم تُرسل  التفصيل بالأسفل.", [failed.toLocaleString("en-US")]) : dt("اكتملت كل الرسائل دون مشاكل.")}
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
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{dt("الرسائل التي لم تُرسل")}</h4>
          {failed > problems.length && (
            <p className="mb-2 text-[11px] text-slate-500">
              {dtx("يظهر أول {0} من {1} حالة تعذّر إرسال؛ راجع السجل للتفاصيل الكاملة.", [problems.length.toLocaleString("en-US"), failed.toLocaleString("en-US")])}
            </p>
          )}
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
