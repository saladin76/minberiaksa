"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail, MessageCircle, CheckCircle2, XCircle, AlertTriangle, Calendar, User, Phone,
  Globe, Loader2, FileCode, FileText, Copy, CheckCheck, Zap, Send, SlashIcon,
  RefreshCw, Megaphone, ArrowLeftRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { fmtFull, type StageBuilder } from "./channel-ui";

/**
 * The معاينة sheet — one delivery, opened from a row on either channel page.
 *
 * It answers the two questions a row can only hint at: what did the recipient actually receive, and
 * how far did it get? The rendered content and the lifecycle live in the same panel deliberately —
 * they are read together ("it failed… showing what?"), and splitting them across two dialogs would
 * make the row's click target ambiguous.
 *
 * Content is fetched on open rather than carried in the table payload: `renderedBody` is a whole
 * email document, and twenty-five of them per page is a lot of bytes for something usually unread.
 */

export type FullDelivery = {
  id: string;
  channel: string;
  status: string;
  origin: string;
  purpose: string;
  provider: string | null;
  templateId: string | null;
  templateName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  locale: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  variables: unknown;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  retriedAt: string | null;
  retryOfDeliveryId: string | null;
};

type RetryRef = {
  id: string;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type Payload = {
  item: FullDelivery;
  retry: RetryRef | null;
  retryable: boolean;
  retryBlockedReason: string | null;
};

const STATUS_META: Record<string, { bg: string; text: string; label: string; icon: typeof CheckCircle2 }> = {
  SENT: { bg: "bg-emerald-50", text: "text-emerald-700", label: "أُرسلت", icon: CheckCircle2 },
  SENT_TO_PROVIDER: { bg: "bg-emerald-50", text: "text-emerald-700", label: "سُلّمت للمزود", icon: CheckCircle2 },
  DELIVERED: { bg: "bg-sky-50", text: "text-sky-700", label: "وصلت", icon: CheckCircle2 },
  OPENED: { bg: "bg-sky-50", text: "text-sky-700", label: "فُتحت", icon: CheckCircle2 },
  READ: { bg: "bg-sky-50", text: "text-sky-700", label: "قُرئت", icon: CheckCircle2 },
  CLICKED: { bg: "bg-sky-50", text: "text-sky-700", label: "نُقرت", icon: CheckCircle2 },
  REPLIED: { bg: "bg-sky-50", text: "text-sky-700", label: "ردّ عليها", icon: CheckCircle2 },
  FAILED: { bg: "bg-rose-50", text: "text-rose-700", label: "فشلت", icon: XCircle },
  BOUNCED: { bg: "bg-rose-50", text: "text-rose-700", label: "ارتدّت", icon: XCircle },
  SKIPPED: { bg: "bg-amber-50", text: "text-amber-700", label: "لم تُرسل", icon: AlertTriangle },
  RENDERED: { bg: "bg-slate-100", text: "text-slate-600", label: "جاهزة", icon: FileText },
  QUEUED: { bg: "bg-slate-100", text: "text-slate-600", label: "في الطابور", icon: FileText },
  DRAFT: { bg: "bg-slate-100", text: "text-slate-600", label: "مسودة", icon: FileText },
};

const ORIGIN_LABELS: Record<string, { label: string; icon: typeof Zap }> = {
  TRIGGER: { label: "تلقائي (مُشغِّل)", icon: Zap },
  MANUAL: { label: "يدوي", icon: Send },
  CAMPAIGN: { label: "حملة", icon: Megaphone },
  TEST: { label: "تجربة", icon: FileText },
  REACTIVATION: { label: "إعادة تفعيل", icon: RefreshCw },
  SYSTEM: { label: "النظام", icon: FileText },
};

const PURPOSE_LABELS: Record<string, string> = {
  TRANSACTIONAL: "تشغيلية",
  MARKETING: "تسويقية",
  UTILITY: "خدمية",
  AUTHENTICATION: "تحقّق",
};

type Props = {
  id: string | null;
  /** Channel-specific lifecycle rungs — the same builder the table row uses. */
  stagesFor: StageBuilder;
  trackingLive: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offer a single-message retry from inside the sheet. */
  onRetry?: (id: string) => void;
};

export function DeliveryPreviewSheet({ id, stagesFor, trackingLive, onOpenChange, onRetry }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | "vars" | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/communication/deliveries/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر تحميل الرسالة");
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const copy = useCallback(async (key: "subject" | "body" | "vars", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const row = data?.item;
  const isEmail = row?.channel === "EMAIL";
  const ChannelIcon = isEmail ? Mail : MessageCircle;
  const statusMeta = row ? STATUS_META[row.status] ?? STATUS_META.RENDERED : null;
  const StatusIcon = statusMeta?.icon;
  const originMeta = row ? ORIGIN_LABELS[row.origin] ?? ORIGIN_LABELS.SYSTEM : null;

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full overflow-y-auto p-0 sm:max-w-[760px]" dir="rtl">
        <SheetHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white p-5">
          <SheetTitle className="flex items-center justify-between gap-3 text-right">
            <span className="flex min-w-0 items-center gap-2">
              <ChannelIcon className="h-5 w-5 shrink-0 text-brand" />
              <span className="truncate">معاينة الرسالة</span>
            </span>
            {statusMeta && StatusIcon && (
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", statusMeta.bg, statusMeta.text)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {statusMeta.label}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {error ? (
          <div className="p-5">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
          </div>
        ) : loading || !row ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <MetaRow label="القالب" value={row.templateName || "—"} icon={FileText} />
              <MetaRow label="القناة" value={isEmail ? "البريد الإلكتروني" : "واتساب"} icon={ChannelIcon} />
              <MetaRow label="المصدر" value={originMeta?.label ?? row.origin} icon={originMeta?.icon ?? FileText} />
              <MetaRow label="الغرض" value={PURPOSE_LABELS[row.purpose] ?? row.purpose} icon={Megaphone} />
              <MetaRow
                label="اللغة"
                value={LOCALE_LABELS[row.locale as keyof typeof LOCALE_LABELS] ?? row.locale ?? "—"}
                icon={Globe}
              />
              <MetaRow label="التاريخ" value={fmtFull(row.createdAt)} icon={Calendar} />
              {row.providerMessageId && (
                <MetaRow label="معرّف المزود" value={row.providerMessageId} icon={FileCode} mono />
              )}
              {row.provider && <MetaRow label="المزوّد" value={row.provider} icon={ArrowLeftRight} />}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">المستلم</div>
              <div className="space-y-1.5 text-sm">
                {row.recipientName && (
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    {row.recipientName}
                  </div>
                )}
                {row.recipientEmail && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span dir="ltr">{row.recipientEmail}</span>
                  </div>
                )}
                {row.recipientPhone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span dir="ltr">{row.recipientPhone}</span>
                  </div>
                )}
                {!row.recipientName && !row.recipientEmail && !row.recipientPhone && (
                  <span className="text-slate-400">لا يوجد عنوان مسجّل — لهذا لم تُرسل.</span>
                )}
              </div>
            </div>

            {row.errorMessage && (
              <div
                className={cn(
                  "rounded-xl border p-4 text-sm",
                  row.status === "SKIPPED"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-rose-200 bg-rose-50 text-rose-900",
                )}
              >
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  {row.status === "SKIPPED" ? <SlashIcon className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {row.status === "SKIPPED" ? "سبب عدم الإرسال" : "رسالة الخطأ"}
                </div>
                <p className="whitespace-pre-wrap break-words text-xs" dir="ltr">{row.errorMessage}</p>
              </div>
            )}

            {/* Retry state. A row that failed and was later re-sent successfully still *reads* as a
                failure without this — the record of what happened next lives on a different row. */}
            {data.retry ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
                  <RefreshCw className="h-4 w-4 text-brand" />
                  أُعيد إرسالها
                </div>
                <p className="text-xs text-slate-600">
                  {data.retry.status === "SENT" || data.retry.status === "DELIVERED"
                    ? `نجحت المحاولة الجديدة في ${fmtFull(data.retry.sentAt ?? data.retry.createdAt)}.`
                    : `المحاولة الجديدة انتهت بحالة ${data.retry.status}${data.retry.errorMessage ? ` — ${data.retry.errorMessage}` : ""}.`}
                </p>
              </div>
            ) : data.retryable && onRetry ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-50/50 p-4">
                <div className="min-w-0 text-xs text-slate-700">
                  <b className="block text-slate-900">هذه الرسالة لم تصل المستلم</b>
                  يمكن إعادة إرسالها الآن بنفس المحتوى المحفوظ.
                </div>
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => onRetry(row.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة الإرسال
                </Button>
              </div>
            ) : data.retryBlockedReason && (row.status === "FAILED" || row.status === "SKIPPED" || row.status === "BOUNCED") ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
                {data.retryBlockedReason}
              </p>
            ) : null}

            <div>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">المسار الزمني</h3>
              <Timeline stages={stagesFor(row)} trackingLive={trackingLive} />
            </div>

            <Tabs defaultValue="preview" dir="rtl">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="preview">معاينة</TabsTrigger>
                <TabsTrigger value="source">المصدر</TabsTrigger>
                <TabsTrigger value="variables">المتغيرات</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-4 space-y-3">
                {row.renderedSubject && (
                  <div>
                    <SectionLabel
                      label="الموضوع"
                      copied={copied === "subject"}
                      onCopy={() => copy("subject", row.renderedSubject!)}
                    />
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                      {row.renderedSubject}
                    </div>
                  </div>
                )}

                <div>
                  <SectionLabel
                    label={isEmail ? "نسخة البريد المُرسَلة" : "نسخة الرسالة"}
                    copied={copied === "body"}
                    onCopy={() => copy("body", row.renderedBody ?? "")}
                  />
                  {!row.renderedBody ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                      لا توجد نسخة محفوظة من محتوى هذه الرسالة.
                    </div>
                  ) : isEmail ? (
                    // `sandbox=""` with no tokens: the stored HTML is rendered with scripts, forms and
                    // same-origin access all withheld, so a hostile template cannot reach the dashboard.
                    <iframe
                      title="معاينة البريد"
                      sandbox=""
                      srcDoc={row.renderedBody}
                      className="h-[500px] w-full rounded-lg border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-emerald-50/40 p-4 text-sm leading-relaxed text-slate-900">
                      {row.renderedBody}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="source" className="mt-4">
                <SectionLabel
                  label={isEmail ? "HTML الخام" : "نص الرسالة"}
                  icon={FileCode}
                  copied={copied === "body"}
                  onCopy={() => copy("body", row.renderedBody ?? "")}
                />
                <pre
                  dir="ltr"
                  className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100"
                >
                  {row.renderedBody || "—"}
                </pre>
              </TabsContent>

              <TabsContent value="variables" className="mt-4">
                <SectionLabel
                  label="قيم المتغيرات وقت الإرسال"
                  copied={copied === "vars"}
                  onCopy={() => copy("vars", JSON.stringify(row.variables, null, 2))}
                />
                <pre
                  dir="ltr"
                  className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-800"
                >
                  {row.variables ? JSON.stringify(row.variables, null, 2) : "(لا توجد متغيرات)"}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Vertical lifecycle. Ordered by stage, not by which timestamps exist, so gaps stay visible. */
function Timeline({ stages, trackingLive }: { stages: ReturnType<StageBuilder>; trackingLive: boolean }) {
  return (
    <ol className="relative space-y-0">
      {stages.map((stage, i) => {
        const done = Boolean(stage.at);
        const blind = !done && !stage.local && !trackingLive;
        const Icon = stage.icon;
        const last = i === stages.length - 1;
        return (
          <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn("absolute top-7 h-[calc(100%-1.75rem)] w-px", done ? "bg-brand/25" : "bg-slate-200")}
                style={{ insetInlineStart: "0.875rem" }}
              />
            )}
            <span
              className={cn(
                "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                done ? "border-brand/25 bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-300",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-xs font-semibold", done ? "text-slate-900" : "text-slate-400")}>{stage.label}</p>
              <p className="text-[11px] tabular-nums text-slate-500" dir="ltr">{done ? fmtFull(stage.at) : "—"}</p>
              {blind && <p className="text-[10px] text-amber-600">لا توجد بيانات تتبّع لهذه المرحلة</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SectionLabel({
  label,
  icon: Icon,
  copied,
  onCopy,
}: {
  label: string;
  icon?: typeof FileCode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onCopy}>
        {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        نسخ
      </Button>
    </div>
  );
}

function MetaRow({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string;
  icon: typeof Mail;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span className={cn("inline-flex items-center gap-1.5 text-sm text-slate-900", mono && "font-mono text-xs")}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate" title={value}>{value}</span>
      </span>
    </div>
  );
}
