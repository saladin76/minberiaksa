"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageCircle, Check, CheckCheck, Reply, TriangleAlert, Search, Loader2, RefreshCw,
  Inbox, SlashIcon, ChevronLeft, ChevronRight, Send, CircleAlert, FileCheck2, Plug,
} from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MetricSummaryBand } from "@/components/dashboard/MetricSummaryBand";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CHART_THEME, CHART_STATUS, CHART_TOOLTIP_STYLE } from "@/lib/dashboard/chart-theme";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import {
  DeliveryStatusPill, FunnelCard, TrackingBanner, SegmentedControl, RowActions,
  RecipientCell, ORIGIN_LABELS, fmtDateTime,
  type JourneyStage, type StageSource,
} from "../../_shared/channel-ui";
import { DeliveryPreviewSheet } from "../../_shared/DeliveryPreviewSheet";
import { RetryDialog } from "../../_shared/RetryDialog";
import { useCampaignScope, CampaignScopeBanner } from "../../_shared/CampaignScope";
import { cn } from "@/lib/utils";

export type WhatsappRow = {
  id: string;
  status: string;
  origin: string;
  templateName: string | null;
  renderedBody: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  recipientUserId: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  providerConversationId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  retriedAt: string | null;
};

type TemplateRow = {
  id: string; name: string; approvalStatus: string | null; category: string | null;
  language: string | null; registered: boolean; ready: boolean; state: string; updatedAt: string;
};

type Payload = {
  summary: {
    total: number; allTimeTotal: number; attempted: number; delivered: number; read: number;
    replied: number; failed: number; skipped: number;
    deliveredRate: number; readRate: number; repliedRate: number; failedRate: number;
  };
  trackingLive: boolean;
  /** Failed/skipped messages in range that have not been re-sent yet. */
  retryableCount: number;
  provider: { configured: boolean; reason: string | null; missingFields: string[] };
  templates: { total: number; ready: number; rows: TemplateRow[] };
  statusCounts: Record<string, number>;
  timeseries: Array<{ date: string; sent: number; delivered: number; read: number; failed: number }>;
  rows: WhatsappRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

const PERIODS = [
  { value: 7, label: "٧ أيام" },
  { value: 30, label: "٣٠ يومًا" },
  { value: 90, label: "٩٠ يومًا" },
  { value: 365, label: "سنة" },
];

const STATUS_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "SENT", label: "مُرسل" },
  { value: "read", label: "مقروء" },
  { value: "replied", label: "بردّ" },
  { value: "failed", label: "فاشل" },
  { value: "SKIPPED", label: "متخطّى" },
];

const TEMPLATE_STATE_STYLE: Record<string, { label: string; className: string }> = {
  READY: { label: "جاهز للإرسال", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  NOT_REGISTERED: { label: "غير مسجّل لدى Meta", className: "border-amber-200 bg-amber-50 text-amber-700" },
  PENDING: { label: "بانتظار الموافقة", className: "border-sky-200 bg-sky-50 text-sky-700" },
  REJECTED: { label: "مرفوض", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function buildStages(row: StageSource): JourneyStage[] {
  return [
    // `sent` is our own record of handing the message over — never an "unknown".
    { key: "sent", label: "أُرسل", at: row.sentAt ?? row.createdAt, icon: Send, local: true },
    { key: "delivered", label: "وصل", at: row.deliveredAt, icon: Check },
    { key: "read", label: "قُرئ", at: row.readAt ?? null, icon: CheckCheck },
    { key: "replied", label: "ردّ", at: row.repliedAt ?? null, icon: Reply },
  ];
}

/**
 * Why the channel is or is not able to send.
 *
 * WhatsApp has two independent prerequisites — a configured Meta connection and at least one
 * Meta-approved template — and failing either produces the same symptom: nothing sends, silently.
 * Showing both side by side turns "why is this empty?" into a two-second read.
 */
function ReadinessCard({ provider, templates }: { provider: Payload["provider"]; templates: Payload["templates"] }) {
  const canSend = provider.configured && templates.ready > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-900">جاهزية القناة</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
            canSend ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {canSend ? "يمكن الإرسال" : "لا يمكن الإرسال"}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <Plug className={cn("mt-0.5 h-4 w-4 shrink-0", provider.configured ? "text-emerald-600" : "text-amber-600")} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-800">اتصال Meta WhatsApp</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {provider.configured
                ? "مُعدّ بالكامل."
                : `غير مكتمل${provider.missingFields.length ? ` — ناقص: ${provider.missingFields.join("، ")}` : ""}.`}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <FileCheck2 className={cn("mt-0.5 h-4 w-4 shrink-0", templates.ready > 0 ? "text-emerald-600" : "text-amber-600")} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-800">قوالب معتمدة من Meta</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {templates.ready > 0
                ? `${templates.ready} من ${templates.total} قالب جاهز للإرسال.`
                : `لا يوجد قالب معتمد (${templates.total} قالب محفوظ). الرسائل التي تبدأ من المنصة تتطلّب قالبًا معتمدًا من Meta.`}
            </p>
          </div>
        </div>
      </div>

      {templates.rows.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {templates.rows.map((t) => {
            const style = TEMPLATE_STATE_STYLE[t.state] ?? TEMPLATE_STATE_STYLE.PENDING;
            return (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-slate-700">{t.name}</span>
                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", style.className)}>
                  {style.label}
                </span>
              </div>
            );
          })}
          <Link
            href="/dashboard/templates"
            className="mt-1 inline-block text-[11px] font-semibold text-brand hover:underline"
          >
            إدارة القوالب ←
          </Link>
        </div>
      )}
    </section>
  );
}

export function WhatsappChannelDashboard() {
  const { openUserProfile } = useViewUserProfile();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // null ids = the whole backlog for the period; an array = just those rows.
  const [retryIds, setRetryIds] = useState<string[] | null | undefined>(undefined);

  const { campaignId, campaignName } = useCampaignScope();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), status, page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (campaignId) params.set("campaign", campaignId);
      const res = await fetch(`/api/dashboard/communication/whatsapp?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر تحميل البيانات");
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, status, page, search, campaignId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [days, status, search]);

  const summary = data?.summary;
  const trackingLive = data?.trackingLive ?? false;

  const chartData = useMemo(
    () => (data?.timeseries ?? []).map((d) => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
    [data?.timeseries],
  );

  const funnelSteps = summary
    ? [
        { label: "مقبول لدى المزود", value: summary.attempted, pct: 100, tone: CHART_THEME.primary, always: true },
        { label: "وصل", value: summary.delivered, pct: summary.deliveredRate, tone: CHART_STATUS.info },
        { label: "قُرئ", value: summary.read, pct: summary.readRate, tone: CHART_STATUS.success },
        { label: "ردّ", value: summary.replied, pct: summary.repliedRate, tone: CHART_THEME.secondary },
      ]
    : [];

  const neverSent = Boolean(data && summary && summary.allTimeTotal === 0);

  // Both prerequisites must hold for a retry to have any chance of reaching Meta.
  const canRetry = Boolean(data?.provider.configured) && (data?.templates.ready ?? 0) > 0;
  const retryBlockedReason = !data
    ? null
    : !data.provider.configured
      ? "اتصال Meta غير مكتمل — أكمل الإعداد أولًا."
      : data.templates.ready === 0
        ? "لا يوجد قالب معتمد من Meta — إعادة الإرسال ستُرفض."
        : null;

  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageHeader
          eyebrow="التواصل"
          title="واتساب"
          description="كل رسالة واتساب صادرة، وما حدث لها بعد الإرسال — الوصول والقراءة والردّ والفشل."
          icon={MessageCircle}
          actions={
            <div className="flex items-center gap-2">
              {/* Unlike email, a WhatsApp retry cannot succeed without an approved template — the
                  provider refuses free text outright. Firing a doomed batch would fill the report
                  with identical errors, so the button states the blocker instead. */}
              {(data?.retryableCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => canRetry && setRetryIds(null)}
                  disabled={loading || !canRetry}
                  title={canRetry ? undefined : retryBlockedReason ?? undefined}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  إعادة إرسال المتعثّرة
                  <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {data!.retryableCount.toLocaleString("en-US")}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand hover:text-brand disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                تحديث
              </button>
            </div>
          }
        />

        <CampaignScopeBanner campaignId={campaignId} campaignName={campaignName} clearHref="/dashboard/communication/whatsapp" />

        {/* An empty channel that has never sent is a setup story, not a performance story — say so
            before showing a wall of zeroes that invites the wrong conclusion. */}
        {neverSent && (
          <TrackingBanner>
            <b>لم تُرسل أي رسالة واتساب من المنصة بعد.</b>{" "}
            {data?.provider.configured === false
              ? "اتصال Meta غير مكتمل."
              : data && data.templates.ready === 0
                ? "الاتصال مُعدّ، لكن لا يوجد قالب معتمد من Meta — والرسائل التي تبدأ من المنصة تتطلّب قالبًا معتمدًا."
                : "راجع جاهزية القناة بالأسفل."}
          </TrackingBanner>
        )}

        {summary && (
          <MetricSummaryBand
            icon={MessageCircle}
            eyebrow="رسائل واتساب المرسلة"
            badge={`آخر ${days} يومًا`}
            value={summary.attempted.toLocaleString("en-US")}
            note="عدد الرسائل التي قبلها مزوّد واتساب خلال الفترة. الرسائل المتخطّاة غير محسوبة هنا."
            stats={[
              { label: "وصلت", icon: Check, value: trackingLive ? summary.delivered.toLocaleString("en-US") : "—" },
              { label: "قُرئت", icon: CheckCheck, value: trackingLive ? summary.read.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.readRate}%` : undefined },
              { label: "ردّوا", icon: Reply, value: trackingLive ? summary.replied.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.repliedRate}%` : undefined },
              { label: "فشلت", icon: TriangleAlert, value: summary.failed.toLocaleString("en-US"), hint: `${summary.failedRate}%` },
              { label: "متخطّاة", icon: SlashIcon, value: summary.skipped.toLocaleString("en-US") },
            ]}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-slate-900">حركة الإرسال</h2>
              <SegmentedControl options={PERIODS} value={days} onChange={setDays} />
            </div>

            {loading && !data ? (
              <div className="h-[220px] animate-pulse rounded-lg bg-slate-50" />
            ) : chartData.length === 0 ? (
              <EmptyState
                title="لا توجد رسائل في هذه الفترة"
                description={neverSent ? "لم تُرسل رسائل واتساب بعد." : "جرّب فترة أطول."}
                variant="inline"
              />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_THEME.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={CHART_THEME.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ fontSize: 11, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="sent" name="مُرسل" stroke={CHART_THEME.primary} strokeWidth={2} fill="url(#waSent)" />
                  <Area type="monotone" dataKey="failed" name="فاشل" stroke={CHART_STATUS.danger} strokeWidth={1.5} fill="transparent" />
                  {trackingLive && (
                    <Area type="monotone" dataKey="read" name="مقروء" stroke={CHART_STATUS.success} strokeWidth={1.5} fill="transparent" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          <div className="space-y-4">
            {data && <ReadinessCard provider={data.provider} templates={data.templates} />}
            {summary && !neverSent && <FunnelCard steps={funnelSteps} trackingLive={trackingLive} />}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">سجل الرسائل</h2>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} />
              <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }} className="relative">
                <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="بحث بالرقم أو القالب…"
                  className="h-8 w-56 rounded-lg border border-slate-200 bg-white pe-8 ps-3 text-xs text-slate-700 outline-none transition focus:border-brand"
                />
              </form>
            </div>
          </div>

          {error ? (
            <EmptyState title="تعذّر التحميل" description={error} className="m-4" />
          ) : loading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-50" />
              ))}
            </div>
          ) : !data?.rows.length ? (
            <EmptyState
              title="لا توجد رسائل"
              description={neverSent ? "لم تُرسل أي رسالة واتساب من المنصة بعد." : "لا توجد رسائل مطابقة لهذه التصفية."}
              icon={Inbox}
              className="m-4"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                {/* Explicit widths — see the note on the email table: only the message column is
                    greedy, so nothing pads out the space beside the action buttons. */}
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500">
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">المستلم</th>
                      <th className="w-full max-w-0 px-3 py-2.5 text-right">القالب / النص</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">الحالة</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">المصدر</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">التاريخ</th>
                      <th className="w-px px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const dt = fmtDateTime(row.createdAt);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setPreviewId(row.id)}
                          className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/70"
                        >
                          <td className="px-3 py-2.5 align-middle">
                            <RecipientCell
                              userId={row.recipientUserId}
                              name={row.recipientName}
                              contact={row.recipientPhone}
                              onOpenProfile={openUserProfile}
                            />
                          </td>
                          <td className="max-w-0 px-3 py-2.5 align-middle">
                            <div className="flex flex-col leading-tight">
                              <span className="truncate text-slate-700">{row.templateName || "—"}</span>
                              <span className="truncate text-[11px] text-slate-400">{row.renderedBody || "—"}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                            <DeliveryStatusPill
                              stages={buildStages(row)}
                              failed={row.status === "FAILED" || row.status === "BOUNCED"}
                              skipped={row.status === "SKIPPED"}
                              errorMessage={row.errorMessage}
                              trackingLive={trackingLive}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              {ORIGIN_LABELS[row.origin] ?? row.origin}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-slate-600">
                            <div className="flex flex-col leading-tight">
                              <span>{dt?.date}</span>
                              <span className="text-[10px] text-slate-400" dir="ltr">{dt?.time}</span>
                            </div>
                          </td>
                          <td className="w-px whitespace-nowrap px-3 py-2.5 align-middle">
                            <RowActions
                              row={row}
                              onPreview={() => setPreviewId(row.id)}
                              onRetry={() => setRetryIds([row.id])}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
                <span className="text-[11px] text-slate-500">
                  {data.pagination.total.toLocaleString("en-US")} رسالة · صفحة {data.pagination.page} من {data.pagination.pages}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"
                    aria-label="السابق"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.pagination.pages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"
                    aria-label="التالي"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {loading && data && (
          <div className="pointer-events-none fixed bottom-4 start-4 z-50 flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> جاري التحديث
          </div>
        )}
      </div>

      <DeliveryPreviewSheet
        id={previewId}
        stagesFor={buildStages}
        trackingLive={trackingLive}
        onOpenChange={(open) => !open && setPreviewId(null)}
        onRetry={(id) => {
          setPreviewId(null);
          setRetryIds([id]);
        }}
      />

      <RetryDialog
        open={retryIds !== undefined}
        channel="WHATSAPP"
        ids={retryIds ?? null}
        days={days}
        onOpenChange={(open) => !open && setRetryIds(undefined)}
        onFinished={() => void load()}
      />
    </div>
  );
}
