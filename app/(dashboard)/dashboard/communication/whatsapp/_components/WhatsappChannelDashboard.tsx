"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MessageCircle, Check, CheckCheck, Reply, TriangleAlert, Search, Loader2, RefreshCw,
  Inbox, SlashIcon, ChevronLeft, ChevronRight, Send,
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
import { CommunicationPurposeTabs } from "../../_shared/CommunicationPurposeTabs";
import { setCommunicationPurposeParams, type CommunicationPurposeGroup } from "@/lib/communication/purpose-group";
import { useCampaignScope, CampaignScopeBanner } from "../../_shared/CampaignScope";
import { cn } from "@/lib/utils";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";
import { ReadinessCard, type WhatsappTemplateReadiness } from "./ReadinessCard";

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
  templates: WhatsappTemplateReadiness;
  statusCounts: Record<string, number>;
  timeseries: Array<{ date: string; sent: number; delivered: number; read: number; failed: number }>;
  rows: WhatsappRow[];
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
  { value: "read", get label() { return dt("مقروء"); } },
  { value: "replied", get label() { return dt("بردّ"); } },
  { value: "failed", get label() { return dt("فاشل"); } },
  { value: "SKIPPED", get label() { return dt("متخطّى"); } },
];

export function buildStages(row: StageSource): JourneyStage[] {
  return [
    // `sent` is our own record of handing the message over  never an "unknown".
    { key: "sent", label: dt("أُرسل"), at: row.sentAt ?? row.createdAt, icon: Send, local: true },
    { key: "delivered", label: dt("وصل"), at: row.deliveredAt, icon: Check },
    { key: "read", label: dt("قُرئ"), at: row.readAt ?? null, icon: CheckCheck },
    { key: "replied", label: dt("ردّ"), at: row.repliedAt ?? null, icon: Reply },
  ];
}


export function WhatsappChannelDashboard() {
  const { openUserProfile } = useViewUserProfile();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignQuery = searchParams.get("campaign");
  const explicitView = searchParams.get("view");
  const purposeGroup: CommunicationPurposeGroup = explicitView === "marketing"
    ? "MARKETING"
    : explicitView === "automatic"
      ? "AUTOMATIC"
      : campaignQuery
        ? "MARKETING"
        : "AUTOMATIC";
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

  const changePurposeGroup = useCallback((group: CommunicationPurposeGroup) => {
    const params = setCommunicationPurposeParams(searchParams.toString(), group);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setPage(1);
  }, [pathname, router, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), status, page: String(page), limit: "25" });
      params.set("purposeGroup", purposeGroup);
      if (search) params.set("search", search);
      if (campaignId) params.set("campaign", campaignId);
      const res = await fetch(`/api/dashboard/communication/whatsapp?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || dt("تعذّر تحميل البيانات"));
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, status, page, search, campaignId, purposeGroup]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [days, status, search, campaignId]);

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
        { label: dt("مقبول لدى المزود"), value: summary.attempted, pct: 100, tone: CHART_THEME.primary, always: true },
        { label: dt("وصل"), value: summary.delivered, pct: summary.deliveredRate, tone: CHART_STATUS.info },
        { label: dt("قُرئ"), value: summary.read, pct: summary.readRate, tone: CHART_STATUS.success },
        { label: dt("ردّ"), value: summary.replied, pct: summary.repliedRate, tone: CHART_THEME.secondary },
      ]
    : [];

  const neverSent = Boolean(data && summary && summary.allTimeTotal === 0);

  // Both prerequisites must hold for a retry to have any chance of reaching Meta.
  const canRetry = Boolean(data?.provider.configured) && (data?.templates.ready ?? 0) > 0;
  const retryBlockedReason = !data
    ? null
    : !data.provider.configured
      ? dt("اتصال Meta غير مكتمل  أكمل الإعداد أولًا.")
      : data.templates.ready === 0
        ? dt("لا يوجد قالب معتمد من Meta  إعادة الإرسال ستُرفض.")
        : null;

  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageHeader
          eyebrow={dt("التواصل")}
          title={dt("واتساب")}
          description={dt("كل رسالة واتساب صادرة، وما حدث لها بعد الإرسال  الوصول والقراءة والردّ والفشل.")}
          icon={MessageCircle}
          actions={
            <div className="flex items-center gap-2">
              {/* Unlike email, a WhatsApp retry cannot succeed without an approved template  the
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

        <CommunicationPurposeTabs value={purposeGroup} onChange={changePurposeGroup} />

        <CampaignScopeBanner campaignId={campaignId} campaignName={campaignName} clearHref="/dashboard/communication/whatsapp" />

        {/* An empty channel that has never sent is a setup story, not a performance story  say so
            before showing a wall of zeroes that invites the wrong conclusion. */}
        {neverSent && (
          <TrackingBanner>
            <b>{dt("لم تُرسل أي رسالة واتساب من المنصة بعد.")}</b>{" "}
            {data?.provider.configured === false
              ? dt("اتصال Meta غير مكتمل.")
              : data && data.templates.ready === 0
                ? dt("الاتصال مُعدّ، لكن لا يوجد قالب معتمد من Meta  والرسائل التي تبدأ من المنصة تتطلّب قالبًا معتمدًا.")
                : dt("راجع جاهزية القناة بالأسفل.")}
          </TrackingBanner>
        )}

        {summary && (
          <MetricSummaryBand
            icon={MessageCircle}
            eyebrow={dt("رسائل واتساب المرسلة")}
            badge={campaignId ? dt("إجمالي الحملة") : dt("آخر {0} يومًا", [days])}
            value={summary.attempted.toLocaleString("en-US")}
            note={campaignId
              ? dt("عدد الرسائل التي قبلها مزوّد واتساب في هذه الحملة. الرسائل المتخطّاة غير محسوبة هنا.")
              : dt("عدد الرسائل التي قبلها مزوّد واتساب خلال الفترة. الرسائل المتخطّاة غير محسوبة هنا.")}
            stats={[
              { label: dt("وصلت"), icon: Check, value: trackingLive ? summary.delivered.toLocaleString("en-US") : "—" },
              { label: dt("قُرئت"), icon: CheckCheck, value: trackingLive ? summary.read.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.readRate}%` : undefined },
              { label: dt("ردّوا"), icon: Reply, value: trackingLive ? summary.replied.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.repliedRate}%` : undefined },
              { label: dt("فشلت"), icon: TriangleAlert, value: summary.failed.toLocaleString("en-US"), hint: `${summary.failedRate}%` },
              { label: dt("متخطّاة"), icon: SlashIcon, value: summary.skipped.toLocaleString("en-US") },
            ]}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-slate-900">{dt("حركة الإرسال")}</h2>
              {campaignId
                ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500">{dt("مدة الحملة كاملة")}</span>
                : <SegmentedControl options={PERIODS} value={days} onChange={setDays} />}
            </div>

            {loading && !data ? (
              <div className="h-[220px] animate-pulse rounded-lg bg-slate-50" />
            ) : chartData.length === 0 ? (
              <EmptyState
                title={dt("لا توجد رسائل في هذه الفترة")}
                description={neverSent ? dt("لم تُرسل رسائل واتساب بعد.") : dt("جرّب فترة أطول.")}
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
            {data && <ReadinessCard provider={data.provider} templates={data.templates} onSynced={() => void load()} />}
            {summary && !neverSent && <FunnelCard steps={funnelSteps} trackingLive={trackingLive} />}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[13px] font-semibold text-slate-900">{dt("سجل الرسائل")}</h2>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} />
              <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }} className="relative">
                <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={dt("بحث بالرقم أو القالب…")}
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
              description={neverSent ? dt("لم تُرسل أي رسالة واتساب من المنصة بعد.") : dt("لا توجد رسائل مطابقة لهذه التصفية.")}
              icon={Inbox}
              className="m-4"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                {/* Explicit widths  see the note on the email table: only the message column is
                    greedy, so nothing pads out the space beside the action buttons. */}
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500">
                      <th className="whitespace-nowrap px-3 py-2.5 text-start">{dt("المستلم")}</th>
                      <th className="w-full max-w-0 px-3 py-2.5 text-start">{dt("القالب / النص")}</th>
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
        channel="WHATSAPP"
        ids={retryIds ?? null}
        purposeGroup={purposeGroup}
        days={days}
        campaignId={campaignId || null}
        campaignName={campaignName}
        onOpenChange={(open) => !open && setRetryIds(undefined)}
        onFinished={() => void load()}
      />
    </div>
  );
}
