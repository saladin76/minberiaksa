"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare, Check, TriangleAlert, Search, Loader2, RefreshCw, Inbox, SlashIcon,
  ChevronLeft, ChevronRight, Send, Globe, Flag, Layers, Zap,
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
import { segmentSms } from "@/lib/communication/sms-segments";
import {
  DeliveryStatusPill, FunnelCard, TrackingBanner, SegmentedControl, RowActions,
  RecipientCell, ORIGIN_LABELS, fmtDateTime,
  type JourneyStage, type StageSource,
} from "../../_shared/channel-ui";
import { DeliveryPreviewSheet } from "../../_shared/DeliveryPreviewSheet";
import { RetryDialog } from "../../_shared/RetryDialog";
import { useCampaignScope, CampaignScopeBanner } from "../../_shared/CampaignScope";
import { cn } from "@/lib/utils";

export type SmsRow = {
  id: string;
  status: string;
  origin: string;
  provider: string | null;
  templateName: string | null;
  renderedBody: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  recipientUserId: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  retriedAt: string | null;
};

type RouteState = { configured: boolean; reason: string | null; missingFields: string[] };

type Payload = {
  summary: {
    total: number; allTimeTotal: number; attempted: number; delivered: number;
    failed: number; skipped: number; deliveredRate: number; failedRate: number;
  };
  trackingLive: boolean;
  retryableCount: number;
  routing: {
    netgsm: RouteState;
    brevoSms: RouteState;
    anyConfigured: boolean;
    providerVolume: Array<{ provider: string; count: number }>;
  };
  segments: {
    messages: number; segments: number; ucs2Messages: number; gsm7Messages: number; avgSegments: number;
  };
  triggersSupported: boolean;
  statusCounts: Record<string, number>;
  timeseries: Array<{ date: string; sent: number; delivered: number; failed: number }>;
  rows: SmsRow[];
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
  { value: "delivered", label: "وصل" },
  { value: "failed", label: "فاشل" },
  { value: "SKIPPED", label: "متخطّى" },
];

const PROVIDER_LABELS: Record<string, string> = {
  NETGSM_SMS: "Netgsm (تركيا)",
  BREVO_SMS: "Brevo (دولي)",
  NETGSM: "Netgsm (تركيا)",
};

/**
 * SMS has the shortest ladder of the three channels: we handed it over, and the carrier confirmed
 * the handset got it. There is no open and no read — delivery is the end of what can be known.
 */
export function buildStages(row: StageSource): JourneyStage[] {
  return [
    { key: "sent", label: "أُرسل", at: row.sentAt ?? row.createdAt, icon: Send, local: true },
    { key: "delivered", label: "وصل", at: row.deliveredAt, icon: Check },
  ];
}

/**
 * Where SMS can and cannot reach.
 *
 * The provider is picked per recipient — Turkish numbers to Netgsm, everything else to Brevo — so
 * this channel can be genuinely half-working. Reporting one "configured" flag would let "we can
 * text Turkey but nowhere else" read as a healthy channel.
 */
function RoutingCard({ routing }: { routing: Payload["routing"] }) {
  const routes = [
    {
      key: "netgsm",
      icon: Flag,
      title: "أرقام تركيا (+90)",
      provider: "Netgsm",
      state: routing.netgsm,
    },
    {
      key: "brevo",
      icon: Globe,
      title: "الأرقام الدولية",
      provider: "Brevo SMS",
      state: routing.brevoSms,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-900">توجيه الإرسال</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
            routing.anyConfigured
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {routing.anyConfigured ? "يمكن الإرسال" : "لا يمكن الإرسال"}
        </span>
      </div>

      <div className="space-y-2">
        {routes.map((route) => {
          const Icon = route.icon;
          return (
            <div key={route.key} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", route.state.configured ? "text-emerald-600" : "text-amber-600")} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-800">
                  {route.title} <span className="font-normal text-slate-400">← {route.provider}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  {route.state.configured
                    ? "مُعدّ بالكامل."
                    : `غير مكتمل${route.state.missingFields.length ? ` — ناقص: ${route.state.missingFields.join("، ")}` : ""}.`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {routing.providerVolume.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {routing.providerVolume.map((p) => (
            <div key={p.provider} className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-slate-700">
                {PROVIDER_LABELS[p.provider] ?? p.provider}
              </span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-700">
                {p.count.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/platform-connections/communication"
        className="mt-3 inline-block text-[11px] font-semibold text-brand hover:underline"
      >
        إعدادات المزوّدين ←
      </Link>
    </section>
  );
}

/**
 * What the traffic actually costs.
 *
 * SMS is billed per segment, and Arabic forces UCS-2 at 70 characters instead of 160 — so a
 * message count under-states the bill by 2–3× on an Arabic-first platform. This card exists so
 * nobody plans an SMS campaign against the wrong number.
 */
function SegmentsCard({ segments }: { segments: Payload["segments"] }) {
  const ucs2Share = segments.messages > 0 ? Math.round((segments.ucs2Messages / segments.messages) * 100) : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-slate-900">المقاطع المحتسبة</h2>
        <Layers className="h-4 w-4 text-slate-300" />
      </div>

      {segments.messages === 0 ? (
        <p className="text-[11px] leading-5 text-slate-500">
          لا توجد رسائل مُرسلة في هذه الفترة لحساب مقاطعها.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {segments.segments.toLocaleString("en-US")}
            </span>
            <span className="text-xs text-slate-500">
              مقطع من {segments.messages.toLocaleString("en-US")} رسالة
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            بمعدّل {segments.avgSegments} مقطع لكل رسالة — والفوترة تتم بالمقطع، لا بالرسالة.
          </p>

          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600">عربي / يونيكود (٧٠ حرفًا للمقطع)</span>
              <span className="font-bold tabular-nums text-slate-800">{segments.ucs2Messages}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600">لاتيني (١٦٠ حرفًا للمقطع)</span>
              <span className="font-bold tabular-nums text-slate-800">{segments.gsm7Messages}</span>
            </div>
          </div>
        </>
      )}

      {ucs2Share >= 50 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900">
          {ucs2Share}٪ من الرسائل بالعربية — الحرف العربي خارج أبجدية GSM، فيتحوّل المقطع إلى ٧٠ حرفًا
          بدل ١٦٠. رسالة من ٩٠ حرفًا عربيًا تُحتسب مقطعين.
        </p>
      )}
    </section>
  );
}

export function SmsChannelDashboard() {
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
  const [retryIds, setRetryIds] = useState<string[] | null | undefined>(undefined);

  const { campaignId, campaignName } = useCampaignScope();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), status, page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (campaignId) params.set("campaign", campaignId);
      const res = await fetch(`/api/dashboard/communication/sms?${params}`, { cache: "no-store" });
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

  const neverSent = Boolean(data && summary && summary.allTimeTotal === 0);
  const canRetry = Boolean(data?.routing.anyConfigured);

  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageHeader
          eyebrow="التواصل"
          title="الرسائل النصية"
          description="كل رسالة SMS صادرة، ووجهتها ومزوّدها وتكلفتها بالمقاطع — والوصول والفشل."
          icon={MessageSquare}
          actions={
            <div className="flex items-center gap-2">
              {(data?.retryableCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => canRetry && setRetryIds(null)}
                  disabled={loading || !canRetry}
                  title={canRetry ? undefined : "لا يوجد مزوّد SMS مُعدّ — إعادة الإرسال ستُرفض."}
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

        <CampaignScopeBanner campaignId={campaignId} campaignName={campaignName} clearHref="/dashboard/communication/sms" />

        {/* An empty SMS channel is usually a design fact, not a fault: no automatic trigger can emit
            SMS at all, so the only source is a campaign. Saying so stops an operator debugging an
            integration that was never wired to fire. */}
        {neverSent && data && (
          <TrackingBanner>
            <b>لم تُرسل أي رسالة نصية من المنصة بعد.</b>{" "}
            {!data.triggersSupported && (
              <>
                الرسائل التلقائية (إيصالات التبرّع وغيرها) تدعم البريد وواتساب فقط — لا يمكن لأي
                مُشغِّل أن يرسل SMS. الإرسال عبر هذه القناة متاح لحملات التواصل فقط، وهي لا تملك
                واجهة في لوحة التحكم بعد.{" "}
              </>
            )}
            {!data.routing.anyConfigured && "كما أنه لا يوجد مزوّد SMS مُعدّ بعد."}
          </TrackingBanner>
        )}

        {data && !neverSent && !trackingLive && (
          <TrackingBanner>
            <b>تقارير التسليم غير مُفعّلة.</b> لم يصل أي إشعار تسليم من المزوّد، لذلك تظهر «وصلت»
            فارغة — وهذا يعني «لا توجد بيانات»، وليس «لم تصل».
          </TrackingBanner>
        )}

        {summary && (
          <MetricSummaryBand
            icon={MessageSquare}
            eyebrow="الرسائل النصية المرسلة"
            badge={`آخر ${days} يومًا`}
            value={summary.attempted.toLocaleString("en-US")}
            note="عدد الرسائل التي قبلها مزوّد SMS خلال الفترة. الفوترة تتم بالمقاطع — راجع بطاقة المقاطع."
            stats={[
              { label: "وصلت", icon: Check, value: trackingLive ? summary.delivered.toLocaleString("en-US") : "—", hint: trackingLive ? `${summary.deliveredRate}%` : undefined },
              { label: "المقاطع", icon: Layers, value: (data?.segments.segments ?? 0).toLocaleString("en-US") },
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
                description={neverSent ? "لم تُرسل رسائل نصية بعد." : "جرّب فترة أطول."}
                variant="inline"
              />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="smsSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_THEME.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={CHART_THEME.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ fontSize: 11, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="sent" name="مُرسل" stroke={CHART_THEME.primary} strokeWidth={2} fill="url(#smsSent)" />
                  <Area type="monotone" dataKey="failed" name="فاشل" stroke={CHART_STATUS.danger} strokeWidth={1.5} fill="transparent" />
                  {trackingLive && (
                    <Area type="monotone" dataKey="delivered" name="وصل" stroke={CHART_STATUS.success} strokeWidth={1.5} fill="transparent" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </section>

          <div className="space-y-4">
            {data && <RoutingCard routing={data.routing} />}
            {data && <SegmentsCard segments={data.segments} />}
            {/* Two rungs only — there is no open or read to chart, so the funnel stays honest
                by being short rather than padded with metrics SMS cannot produce. */}
            {summary && !neverSent && (
              <FunnelCard
                trackingLive={trackingLive}
                caption="من إجمالي المقبول"
                steps={[
                  { label: "مقبول لدى المزود", value: summary.attempted, pct: 100, tone: CHART_THEME.primary, always: true },
                  { label: "وصل للهاتف", value: summary.delivered, pct: summary.deliveredRate, tone: CHART_STATUS.success },
                ]}
              />
            )}
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
                  placeholder="بحث بالرقم أو النص…"
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
              description={neverSent ? "لم تُرسل أي رسالة نصية من المنصة بعد." : "لا توجد رسائل مطابقة لهذه التصفية."}
              icon={Inbox}
              className="m-4"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                {/* Same width discipline as the other two tables: only the message column is greedy. */}
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500">
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">المستلم</th>
                      <th className="w-full max-w-0 px-3 py-2.5 text-right">النص / القالب</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">المقاطع</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">الحالة</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">المزوّد</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">التاريخ</th>
                      <th className="w-px px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const dt = fmtDateTime(row.createdAt);
                      const seg = segmentSms(row.renderedBody);
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
                              <span className="truncate text-slate-700">{row.renderedBody || "—"}</span>
                              <span className="truncate text-[11px] text-slate-400">
                                {row.templateName || "—"} · {ORIGIN_LABELS[row.origin] ?? row.origin}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                            {/* Segments, not characters: this is the number the invoice uses. */}
                            <span
                              title={`${seg.units} ${seg.encoding === "UCS2" ? "حرفًا (يونيكود، ٧٠ للمقطع)" : "حرفًا (GSM، ١٦٠ للمقطع)"}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                                seg.segments > 1
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600",
                              )}
                            >
                              <Layers className="h-3 w-3" />
                              {seg.segments}
                            </span>
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
                              {PROVIDER_LABELS[row.provider ?? ""] ?? row.provider ?? "—"}
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
        channel="SMS"
        ids={retryIds ?? null}
        days={days}
        onOpenChange={(open) => !open && setRetryIds(undefined)}
        onFinished={() => void load()}
      />
    </div>
  );
}
