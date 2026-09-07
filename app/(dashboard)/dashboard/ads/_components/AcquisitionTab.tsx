"use client";

import * as React from "react";
import axios from "axios";
import { Loader2, UserPlus, Repeat2, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsMetricCard } from "@/components/dashboard/StatsMetricCard";
import { type AdPlatform } from "@/lib/attribution/detect-source";

interface AcquisitionRow {
  platform: AdPlatform;
  platformLabel: string;
  newDonors: number;
  returningDonors: number;
  newDonorRevenue: number;
  returningRevenue: number;
  avgFirstDonation: number;
  campaignCount: number;
}

interface FirstTouchEntityRow {
  key: string;
  label: string;
  platform: AdPlatform;
  platformLabel: string;
  newDonors: number;
  newDonorRevenue: number;
  lifetimeRevenueUSD: number;
  repeatDonationCount: number;
  repeatDonationRate: number;
  returningRevenueUSD: number;
}

interface ResponseShape {
  rows: AcquisitionRow[];
  totals: {
    newDonors: number;
    returningDonors: number;
    newDonorRevenue: number;
    returningRevenue: number;
  };
  firstTouch: {
    byCampaign: FirstTouchEntityRow[];
    byAd: FirstTouchEntityRow[];
  };
}

interface Props {
  filterQs: string;
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0, numberingSystem: "latn" })}`;
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const PLATFORM_ACCENT: Record<AdPlatform, string> = {
  meta: "bg-[#1877F2]",
  google: "bg-[#EA4335]",
  tiktok: "bg-slate-900",
  x: "bg-slate-900",
  snapchat: "bg-amber-400",
  linkedin: "bg-[#0A66C2]",
  reddit: "bg-[#FF4500]",
  "other-paid": "bg-violet-500",
  organic: "bg-slate-400",
};

function FirstTouchTable({
  rows,
  entityHeader,
}: {
  rows: FirstTouchEntityRow[];
  entityHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        لا توجد بيانات first-touch في الفترة المختارة
      </p>
    );
  }
  return (
    <div className="overflow-x-auto" dir="rtl">
      <table className="w-full text-xs text-right">
        <thead className="bg-slate-50/40 border-b border-slate-200">
          <tr>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">
              {entityHeader}
            </th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">متبرعون جدد</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">إيراد التبرع الأول</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">إيرادات لاحقة</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">LTV إجمالي</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">تبرعات مكررة</th>
            <th className="text-right py-2 px-3 font-semibold text-slate-700">معدل التكرار</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
            >
              <td className="py-2 px-3 font-medium text-slate-900 max-w-[260px]">
                <span className="truncate block" title={r.label}>
                  {r.label}
                </span>
              </td>
              <td className="py-2 px-3 text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full", PLATFORM_ACCENT[r.platform])} />
                  {r.platformLabel}
                </span>
              </td>
              <td className="py-2 px-3 text-emerald-700 font-medium">{r.newDonors}</td>
              <td className="py-2 px-3 font-semibold text-slate-800" dir="ltr">
                {fmtMoney(r.newDonorRevenue)}
              </td>
              <td className="py-2 px-3 text-slate-700" dir="ltr">
                {fmtMoney(r.returningRevenueUSD)}
              </td>
              <td className="py-2 px-3 font-semibold text-blue-700" dir="ltr">
                {fmtMoney(r.lifetimeRevenueUSD)}
              </td>
              <td className="py-2 px-3 text-slate-700">{r.repeatDonationCount}</td>
              <td className="py-2 px-3 text-slate-700">{fmtPct(r.repeatDonationRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AcquisitionTab({ filterQs }: Props) {
  const [data, setData] = React.useState<ResponseShape | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"platform" | "campaign" | "ad">("platform");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<ResponseShape>(`/api/admin/ads/acquisition?${filterQs}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل بيانات اكتساب المتبرعين"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterQs]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const totalRev = data.totals.newDonorRevenue + data.totals.returningRevenue;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatsMetricCard
          title="متبرعون جدد"
          value={data.totals.newDonors}
          icon={UserPlus}
          accent="indigo"
          format="number"
          subtitle="أول تبرع في الفترة"
        />
        <StatsMetricCard
          title="متبرعون عائدون"
          value={data.totals.returningDonors}
          icon={Repeat2}
          accent="teal"
          format="number"
          subtitle="تبرعوا سابقًا قبل الفترة"
        />
        <StatsMetricCard
          title="إيرادات جدد"
          value={data.totals.newDonorRevenue}
          icon={TrendingUp}
          accent="emerald"
          format="money"
          subtitle="ما حققه المتبرعون الجدد"
        />
        <StatsMetricCard
          title="إيرادات عائدون"
          value={data.totals.returningRevenue}
          icon={Repeat2}
          accent="blue"
          format="money"
          subtitle="ما حققه المتبرعون العائدون"
        />
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-sky-900 leading-relaxed">
          LTV هنا = مجموع التبرعات الدائمة لكل متبرع كان first-touch له في هذه
          الفترة. القيمة تعكس صحة المتبرع الذي جلبه هذا الإعلان حتى الآن — وليس
          قيمة الإعلان داخل الفترة فقط.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              تفصيل الاكتساب — first-touch
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              من أين جاء كل متبرع أول مرة، وكم استمر يدفع بعدها
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { k: "platform", label: "حسب المنصة" },
                { k: "campaign", label: "حسب الحملة" },
                { k: "ad", label: "حسب الإعلان" },
              ] as const
            ).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "h-8 px-3 text-xs rounded-lg border transition-colors",
                  tab === k
                    ? "bg-brand text-white border-brand"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "platform" ? (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/40 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">متبرعون جدد</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">إيرادات جدد</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">متبرعون عائدون</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">إيرادات عائدون</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">متوسط أول تبرع</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">حملات متبرعين</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">حصة من إيراد</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                      لا توجد بيانات اكتساب في الفترة المختارة
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => {
                    const rev = r.newDonorRevenue + r.returningRevenue;
                    const share = totalRev > 0 ? (rev / totalRev) * 100 : 0;
                    return (
                      <tr
                        key={r.platform}
                        className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-2 px-3 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-block w-2 h-2 rounded-full",
                                PLATFORM_ACCENT[r.platform]
                              )}
                            />
                            {r.platformLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-700 font-medium">{r.newDonors}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800" dir="ltr">
                          {fmtMoney(r.newDonorRevenue)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{r.returningDonors}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800" dir="ltr">
                          {fmtMoney(r.returningRevenue)}
                        </td>
                        <td className="py-2 px-3 text-slate-700" dir="ltr">
                          {r.newDonors > 0 ? fmtMoney(r.avgFirstDonation) : "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{r.campaignCount}</td>
                        <td className="py-2 px-3 text-slate-600">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={cn("h-full", PLATFORM_ACCENT[r.platform])}
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-[11px]">{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "campaign" ? (
          <FirstTouchTable
            rows={data.firstTouch.byCampaign}
            entityHeader="الحملة (first-touch)"
          />
        ) : (
          <FirstTouchTable
            rows={data.firstTouch.byAd}
            entityHeader="الإعلان (first-touch)"
          />
        )}
      </div>
    </div>
  );
}
