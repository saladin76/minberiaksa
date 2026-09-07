"use client";

import * as React from "react";
import axios from "axios";
import { Loader2, Info, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  istanbulTodayKey,
  istanbulAddCalendarDaysKey,
} from "@/lib/dashboard/istanbul-client-date";

type GroupBy =
  | "platform"
  | "campaign"
  | "ad_group"
  | "ad"
  | "placement"
  | "country"
  | "channel";

const GROUP_LABEL: Record<GroupBy, string> = {
  platform: "المنصة",
  campaign: "الحملة",
  ad_group: "المجموعة الإعلانية",
  ad: "الإعلان",
  placement: "الموضع",
  country: "الدولة",
  channel: "قناة الرسائل",
};

interface ReconcileRow {
  platform: string | null;
  channel: string | null;
  connectionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  adId: string | null;
  adName: string | null;
  placement: string | null;
  country: string | null;
  sitePaidDonations: number;
  siteRevenue: number;
  trackingHealth: number;
  confidenceScore: number;
  platformReportedConversions: number | null;
  platformReportedValue: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  sent: number | null;
  delivered: number | null;
  failed: number | null;
  opened: number | null;
  clicked: number | null;
  replied: number | null;
  cpa: number | null;
  roas: number | null;
  platformRoas: number | null;
  roi: number | null;
  difference: number | null;
  likelyReason: string;
}

interface Recommendation {
  id: string;
  kind: string;
  severity: "positive" | "warning" | "info";
  title: string;
  body: string;
  target?: { type: string; key: string; label: string };
  metrics?: { label: string; value: string }[];
}

interface ApiPayload {
  rows: ReconcileRow[];
  hasPlatformData: boolean;
  hasMessagingData: boolean;
  likelyReasonLabels: Record<string, string>;
  recommendations: Recommendation[];
}

const PERIOD_TO_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  all: 365,
};

function fmt(n: number | null, opts?: { precision?: number; prefix?: string }): string {
  if (n == null) return "غير متاح";
  const p = opts?.precision ?? 0;
  return `${opts?.prefix ?? ""}${n.toLocaleString("en-US", {
    maximumFractionDigits: p,
    numberingSystem: "latn",
  })}`;
}
function fmtMoney(n: number | null): string {
  if (n == null) return "غير متاح";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

interface Props {
  period: string;
  dateFrom: string;
  dateTo: string;
}

export function ReconciliationTab({ period, dateFrom, dateTo }: Props) {
  const [groupBy, setGroupBy] = React.useState<GroupBy>("platform");
  const [data, setData] = React.useState<ApiPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const range = React.useMemo(() => {
    if (period === "custom" && dateFrom && dateTo) {
      return { from: dateFrom, to: dateTo };
    }
    const to = istanbulTodayKey();
    const from = istanbulAddCalendarDaysKey(to, -(PERIOD_TO_DAYS[period] ?? 30) + 1);
    return { from, to };
  }, [period, dateFrom, dateTo]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<ApiPayload>(
        `/api/admin/marketing-platform-sync/reconcile?groupBy=${groupBy}&dateFrom=${range.from}&dateTo=${range.to}`
      )
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل التسوية"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupBy, range.from, range.to]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-sky-900 leading-relaxed">
          هذه الصفحة تقارن تبرعات الموقع بالتحويلات المُبلَّغة من منصات الإعلانات.
          إذا لم تتم مزامنة المنصات بعد فستظهر أعمدة المنصة كـ
          «غير متاح» أو «لم تتم المزامنة بعد» — والميتركس المستمدة من الموقع
          تظل كاملة دائمًا.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">تجميع حسب:</span>
        {(Object.keys(GROUP_LABEL) as GroupBy[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setGroupBy(k)}
            className={cn(
              "h-8 px-3 rounded-lg border text-xs transition-colors",
              groupBy === k
                ? "bg-brand text-white border-brand"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            )}
          >
            {GROUP_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-slate-500">
          {!data || !data.hasPlatformData
            ? "لم تتم المزامنة بعد — اذهب إلى «ربط المنصات والحسابات» لتشغيل المزامنة."
            : "لا توجد نتائج في الفترة المختارة."}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto" dir="rtl">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">
                      {GROUP_LABEL[groupBy]}
                    </th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">تبرعات الموقع</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">إيرادات الموقع</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">الإنفاق</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">مرات الظهور</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">النقرات</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">تحويلات المنصة</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">قيمة تحويلات المنصة</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">CPA</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">ROAS الحقيقي</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">ROAS المنصة</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">الفرق</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">السبب المحتمل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => {
                    const label =
                      r.adName ??
                      r.adId ??
                      r.adGroupName ??
                      r.adGroupId ??
                      r.campaignName ??
                      r.campaignId ??
                      r.placement ??
                      r.country ??
                      r.channel ??
                      r.platform ??
                      "—";
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-medium text-slate-900 max-w-[260px] truncate">
                          {label}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{r.platform ?? "—"}</td>
                        <td className="py-2 px-3 text-slate-700">{fmt(r.sitePaidDonations)}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800" dir="ltr">
                          {fmtMoney(r.siteRevenue)}
                        </td>
                        <td className="py-2 px-3 text-slate-700" dir="ltr">
                          {fmtMoney(r.spend)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{fmt(r.impressions)}</td>
                        <td className="py-2 px-3 text-slate-700">{fmt(r.clicks)}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {fmt(r.platformReportedConversions, { precision: 0 })}
                        </td>
                        <td className="py-2 px-3 text-slate-700" dir="ltr">
                          {fmtMoney(r.platformReportedValue)}
                        </td>
                        <td className="py-2 px-3 text-slate-700" dir="ltr">
                          {fmtMoney(r.cpa)}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 font-medium",
                            r.roas != null && r.roas >= 2
                              ? "text-emerald-700"
                              : r.roas != null && r.roas < 1
                              ? "text-rose-700"
                              : "text-slate-700"
                          )}
                        >
                          {r.roas != null ? r.roas.toFixed(2) : "غير متاح"}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {r.platformRoas != null ? r.platformRoas.toFixed(2) : "غير متاح"}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 font-medium",
                            r.difference == null
                              ? "text-slate-400"
                              : r.difference > 0
                              ? "text-amber-700"
                              : r.difference < 0
                              ? "text-sky-700"
                              : "text-emerald-700"
                          )}
                          dir="ltr"
                        >
                          {r.difference == null
                            ? "—"
                            : r.difference > 0
                            ? `+${r.difference}`
                            : r.difference}
                        </td>
                        <td className="py-2 px-3 text-slate-600 max-w-[220px]">
                          <span
                            className="truncate inline-block max-w-full"
                            title={data.likelyReasonLabels[r.likelyReason] ?? r.likelyReason}
                          >
                            {data.likelyReasonLabels[r.likelyReason] ?? r.likelyReason}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {data.recommendations.length > 0 ? (
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-slate-700">توصيات مدفوعة + رسائل</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className={cn(
                      "rounded-lg border p-3",
                      rec.severity === "positive"
                        ? "border-emerald-200 bg-emerald-50"
                        : rec.severity === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-sky-200 bg-sky-50"
                    )}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                      {rec.severity === "warning" ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : rec.severity === "positive" ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : null}
                      {rec.title}
                    </div>
                    <p className="text-[11px] text-slate-700 leading-relaxed">{rec.body}</p>
                    {rec.target ? (
                      <p className="text-[10px] text-slate-500 mt-1 truncate" title={rec.target.label}>
                        الهدف: {rec.target.label}
                      </p>
                    ) : null}
                    {rec.metrics && rec.metrics.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {rec.metrics.map((m) => (
                          <span
                            key={m.label}
                            className="text-[10px] rounded-full bg-white/70 border border-white/40 px-1.5 py-0.5"
                          >
                            <span className="text-slate-500">{m.label}:</span>{" "}
                            <span className="font-medium text-slate-800">{m.value}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!data.hasPlatformData && !data.hasMessagingData ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
              لا توجد بيانات منصة محفوظة بعد — البيانات المعروضة مأخوذة من
              الموقع فقط. اذهب إلى «ربط المنصات والحسابات» وشغل المزامنة لجلب
              بيانات الإنفاق والتحويلات.
            </div>
          ) : null}
        </>
      )}

      <p className="text-[10px] text-slate-500 text-center">
        الفترة: من {range.from} إلى {range.to}
      </p>
    </div>
  );
}
