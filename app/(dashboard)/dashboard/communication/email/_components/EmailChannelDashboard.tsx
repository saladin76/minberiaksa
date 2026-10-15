"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail, MailCheck, MailOpen, MousePointerClick, TriangleAlert, Search, Loader2,
  RefreshCw, Inbox, SlashIcon, ChevronLeft, ChevronRight, Send, CircleAlert,
} from "lucide-react";
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
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

export type EmailRow = {
  id: string;
  status: string;
  origin: string;
  templateName: string | null;
  renderedSubject: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientUserId: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  failedAt: string | null;
  retriedAt: string | null;
};

type Payload = {
  summary: {
    total: number; allTimeTotal: number; attempted: number; delivered: number; opened: number;
    clicked: number; failed: number; skipped: number;
    deliveredRate: number; openRate: number; clickRate: number; failedRate: number;
  };
  trackingLive: boolean;
  /** Failed/skipped messages in range that have not been re-sent yet. */
  retryableCount: number;
  provider: { configured: boolean; reason: string | null; missingFields: string[]; senderReady: boolean };
  statusCounts: Record<string, number>;
  timeseries: Array<{ date: string; sent: number; delivered: number; opened: number; failed: number }>;
  topTemplates: Array<{ name: string; count: number }>;
  rows: EmailRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

const PERIODS = [
  { value: 7, get label() { return dt("٧ أيام"); } },
  { value: 30, get label() { return dt("٣٠ يومًا"); } },
  { value: 90, get label() { return dt("٩٠ يومًا"); } },
  { value: 365, get label() { return dt("سنة"); } },
];

const STATUS_FILTERS = [
  { value: "all", get label() { return dt("الكل"); } },
  { value: "SENT", get label() { return dt("مُرسل"); } },
  { value: "opened", get label() { return dt("مفتوح"); } },
  { value: "clicked", get label() { return dt("مُنقَر"); } },
  { value: "failed", get label() { return dt("فاشل"); } },
  { value: "SKIPPED", get label() { return dt("متخطّى"); } },
];

/** Email's rung names for the shared lifecycle strip. `sent` is our own record, never "unknown". */
export function buildStages(row: StageSource): JourneyStage[] {
  return [
    { key: "sent", label: dt("أُرسل"), at: row.sentAt ?? row.createdAt, icon: Send, local: true },
    { key: "delivered", label: dt("وصل"), at: row.deliveredAt, icon: MailCheck },
    { key: "opened", label: dt("فُتح"), at: row.openedAt ?? null, icon: MailOpen },
    { key: "clicked", label: dt("نُقر"), at: row.clickedAt ?? null, icon: MousePointerClick },
  ];
}

export function EmailChannelDashboard() {
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
      const res = await fetch(`/api/dashboard/communication/email?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || dt("تعذّر تحميل البيانات"));
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, status, page, search, campaignId]);

  useEffect(() => { void load(); }, [load]);

  // Filter changes must reset paging, or page 7 of the old filter silently shows an empty table.
  useEffect(() => { setPage(1); }, [days, status, search, campaignId]);

  const summary = data?.summary;
  const trackingLive = data?.trackingLive ?? false;
  const retryReady = Boolean(data?.provider.configured && data?.provider.senderReady);
  const retryBlockedReason = !data
    ? null
    : !data.provider.configured
      ? dt("مزوّد Elastic Email غير مُعدّ بالكامل.")
      : !data.provider.senderReady
        ? dt("لا توجد هوية مُرسِل بريد مُفعّلة.")
        : null;

  const chartData = useMemo(
    () => (data?.timeseries ?? []).map((d) => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
    [data?.timeseries],
  );

  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageHeader
          eyebrow={dt("التواصل")}
          title={dt("البريد الإلكتروني")}
          description={dt("كل رسالة بريد صادرة، وما حدث لها بعد الإرسال  الوصول والفتح والنقر والفشل.")}
          icon={Mail}
          actions={
            <div className="flex items-center gap-2">
              {/* Only offered when there is actually a backlog  a permanently-visible send button
                  invites a click that would do nothing. */}
              {(data?.retryableCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => retryReady && setRetryIds(null)}
                  disabled={loading || !retryReady}
                  title={retryReady ? undefined : retryBlockedReason ?? undefined}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {dt("إعادة محاولة المتعثّرة")}<span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">
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
                {dt("تحديث")}</button>
            </div>
          }
        />

        <CampaignScopeBanner campaignId={campaignId} campaignName={campaignName} clearHref="/dashboard/communication/email" />

        {data && (!data.provider.configured || !data.provider.senderReady) && (
          <TrackingBanner>
            <b>{dt("إرسال البريد غير جاهز بالكامل.")}</b>{" "}
            {!data.provider.configured
              ? dt("إعداد Elastic Email غير مكتمل.")
              : dt("الاتصال جاهز لكن لا توجد هوية مُرسِل بريد صالحة.")}
            {dt(" تم تعطيل إعادة الإرسال حتى تُحل الجاهزية، بدل إنشاء محاولات محكوم عليها بالفشل.")}</TrackingBanner>
        )}

        {/* Tracking blindness is a first-class state, not a footnote: without it every engagement
            figure below reads as an authoritative zero when it is really "we don't know". */}
        {data && !trackingLive && (
          <TrackingBanner>
            <b>{dt("تتبّع الفتح والنقر غير مُفعّل.")}</b> {dt(" لم يصل أي حدث من Elastic Email حتى الآن، لذلك تظهر أرقام «وصل» و«فُتح» و«نُقر» فارغة  وهذا يعني «لا توجد بيانات»، وليس «لم يفتحها أحد». فعّل الـwebhook في Elastic Email ليبدأ تسجيل الأحداث.")}</TrackingBanner>
        )}

        {summary && (
          <MetricSummaryBand
            icon={Mail}
            eyebrow={dt("رسائل البريد المرسلة")}
            badge={dt("آخر {0} يومًا", [days])}
            value={summary.attempted.toLocaleString("en-US")}
            note={dt("عدد الرسائل التي قبلها مزوّد البريد خلال الفترة. الرسائل المتخطّاة (بدون بريد أو غير مشتركة) غير محسوبة هنا.")}
            stats={[
              { label: dt("وصلت"), icon: MailCheck, value: trackingLive ? summary.delivered.toLocaleString("en-US") : "—" },
              { label: dt("فُتحت"), icon: MailOpen, value: trackingLive ? summary.opened.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.openRate}%` : undefined },
              { label: dt("نُقرت"), icon: MousePointerClick, value: trackingLive ? summary.clicked.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.clickRate}%` : undefined },
              { label: dt("فشلت"), icon: TriangleAlert, value: summary.failed.toLocaleString("en-US"), hint: `${summary.failedRate}%` },
              // Skipped messages are never handed to the provider, so they sit outside every rate
              // above  and they currently outnumber sent mail several times over. Leaving them
              // off the band would make the page report a healthy channel that is mostly silent.
              { label: dt("متخطّاة"), icon: SlashIcon, value: summary.skipped.toLocaleString("en-US") },
            ]}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-slate-900">{dt("حركة الإرسال")}</h2>
              <SegmentedControl options={PERIODS} value={days} onChange={setDays} />
            </div>

            {loading && !data ? (
              <div className="h-[220px] animate-pulse rounded-lg bg-slate-50" />
            ) : chartData.length === 0 ? (
              <EmptyState title={dt("لا توجد رسائل في هذه الفترة")} description={dt("جرّب فترة أطول.")} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="emailSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_THEME.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={CHART_THEME.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ fontSize: 11, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="sent" name="مُرسل" stroke={CHART_THEME.primary} strokeWidth={2} fill="url(#emailSent)" />
                  <Area type="monotone" dataKey="failed" name="فاشل" stroke={CHART_STATUS.danger} strokeWidth={1.5} fill="transparent" />
                  {trackingLive && (
                    <Area type="monotone" dataKey="opened" name="مفتوح" stroke={CHART_STATUS.success} strokeWidth={1.5} fill="transparent" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          {summary && (
            <FunnelCard
              trackingLive={trackingLive}
              steps={[
                { label: dt("مقبول لدى المزود"), value: summary.attempted, pct: 100, tone: CHART_THEME.primary, always: true },
                { label: dt("وصل"), value: summary.delivered, pct: summary.deliveredRate, tone: CHART_STATUS.info },
                { label: dt("فُتح"), value: summary.opened, pct: summary.openRate, tone: CHART_STATUS.success },
                { label: dt("نُقر"), value: summary.clicked, pct: summary.clickRate, tone: CHART_THEME.secondary },
              ]}
            />
          )}
        </div>

        {/* Table */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">{dt("سجل الرسائل")}</h2>

            <div className="ms-auto flex flex-wrap items-center gap-2">
              <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} />

              <form
                onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}
                className="relative"
              >
                <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={dt("بحث بالبريد أو الموضوع…")}
                  className="h-8 w-56 rounded-lg border border-slate-200 bg-white pe-8 ps-3 text-xs text-slate-700 outline-none transition focus:border-brand"
                />
              </form>
            </div>
          </div>

          {error ? (
            <EmptyState title={dt("تعذّر التحميل")} description={error} className="m-4" />
          ) : loading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-50" />
              ))}
            </div>
          ) : !data?.rows.length ? (
            <EmptyState
              title={dt("لا توجد رسائل")}
              description={dt("لم تُرسل رسائل بريد مطابقة لهذه التصفية.")}
              icon={Inbox}
              className="m-4"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                {/* Column widths are explicit so the table cannot distribute leftover space
                    evenly and leave a gulf beside the action buttons: the subject is the only
                    greedy column, everything else hugs its content. */}
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500">
                      <th className="whitespace-nowrap px-3 py-2.5 text-start">{dt("المستلم")}</th>
                      <th className="w-full max-w-0 px-3 py-2.5 text-start">{dt("الموضوع / القالب")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-start">{dt("الحالة")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-start">{dt("المصدر")}</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-start">{dt("التاريخ")}</th>
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
                              contact={row.recipientEmail}
                              onOpenProfile={openUserProfile}
                            />
                          </td>
                          <td className="max-w-0 px-3 py-2.5 align-middle">
                            <div className="flex flex-col leading-tight">
                              <span className="truncate text-slate-700">{row.renderedSubject || "—"}</span>
                              <span className="truncate text-[11px] text-slate-400">{row.templateName || "—"}</span>
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
                  {dtx("{0} رسالة · صفحة {1} من {2}", [data.pagination.total.toLocaleString("en-US"), data.pagination.page, data.pagination.pages])}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"
                    aria-label={dt("السابق")}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.pagination.pages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"
                    aria-label={dt("التالي")}
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
            <Loader2 className="h-3 w-3 animate-spin" /> {dt(" جاري التحديث")}</div>
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
        channel="EMAIL"
        ids={retryIds ?? null}
        days={days}
        onOpenChange={(open) => !open && setRetryIds(undefined)}
        onFinished={() => void load()}
      />
    </div>
  );
}
