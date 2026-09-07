"use client";

import * as React from "react";
import axios from "axios";
import {
  DollarSign,
  Megaphone,
  Globe2,
  Activity,
  ShieldCheck,
  AlertTriangle,
  UserPlus,
  Repeat,
  Loader2,
  Trophy,
  Info,
  TrendingUp,
  TrendingDown,
  Search as SearchIcon,
  Sparkles,
  CircleDollarSign,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { StatsMetricCard } from "@/components/dashboard/StatsMetricCard";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";
import {
  ATTRIBUTION_STATUS_LABEL_AR,
  type AttributionStatus,
} from "@/lib/tracking/tracking-event-contract";
import type { Recommendation } from "@/lib/ads/recommendations";
import { cn } from "@/lib/utils";

interface OverviewBreakdownRow {
  key: string;
  label: string;
  name: string | null;
  id: string | null;
  platform: AdPlatform | null;
  revenueUSD: number;
  paidCount: number;
}

interface OverviewData {
  adRevenueUSD: number;
  organicRevenueUSD: number;
  totalRevenueUSD: number;
  adShare: number;
  paidAdCount: number;
  paidOrganicCount: number;
  failedCount: number;
  trackingHealthPct: number;
  trackingErrorCount: number;
  newDonorsFromAds: number;
  newDonorsOrganic: number;
  topPlatform: OverviewBreakdownRow | null;
  topCampaign: OverviewBreakdownRow | null;
  topAd: OverviewBreakdownRow | null;
  topCountry: OverviewBreakdownRow | null;
  statusDistribution: Record<AttributionStatus, number>;
  revenueByStatus: Record<AttributionStatus, number>;
  recommendations: Recommendation[];
}

interface Props {
  filterQs: string;
}

const STATUS_COLOR: Record<AttributionStatus, string> = {
  verified: "bg-emerald-500",
  strong: "bg-teal-500",
  likely_paid: "bg-lime-500",
  ga4_inferred: "bg-sky-500",
  utm_only: "bg-amber-400",
  organic: "bg-slate-300",
  direct: "bg-slate-400",
  tracking_issue: "bg-rose-500",
};

const STATUS_ORDER: AttributionStatus[] = [
  "verified",
  "strong",
  "likely_paid",
  "ga4_inferred",
  "utm_only",
  "organic",
  "direct",
  "tracking_issue",
];

const REVENUE_STATUS_CARDS: {
  key: AttributionStatus;
  title: string;
  bg: string;
  text: string;
}[] = [
  {
    key: "verified",
    title: "إيرادات إعلانية مؤكدة",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
  },
  {
    key: "strong",
    title: "إيرادات تتبع قوي",
    bg: "bg-teal-50 border-teal-200",
    text: "text-teal-700",
  },
  {
    key: "likely_paid",
    title: "إيرادات إعلانية مرجّحة",
    bg: "bg-lime-50 border-lime-200",
    text: "text-lime-700",
  },
  {
    key: "utm_only",
    title: "إيرادات UTM فقط",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
  },
  {
    key: "organic",
    title: "إيرادات غير إعلانية",
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-700",
  },
  {
    key: "direct",
    title: "إيرادات مباشرة",
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-700",
  },
];

const RECOMMENDATION_ICON: Record<Recommendation["kind"], React.ComponentType<{ className?: string }>> = {
  increase_budget: TrendingUp,
  decrease_budget: TrendingDown,
  investigate_tracking: SearchIcon,
  platform_under_credits: EyeOff,
  high_spend_low_conv: CircleDollarSign,
  promising_market: Sparkles,
};

const RECOMMENDATION_SEVERITY_CLASS: Record<Recommendation["severity"], string> = {
  positive: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-sky-200 bg-sky-50",
};

const RECOMMENDATION_SEVERITY_ICON: Record<Recommendation["severity"], string> = {
  positive: "text-emerald-600 bg-emerald-100",
  warning: "text-amber-700 bg-amber-100",
  info: "text-sky-700 bg-sky-100",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    numberingSystem: "latn",
  })}`;
}

function TopCard({
  title,
  row,
  icon: Icon,
}: {
  title: string;
  row: OverviewBreakdownRow | null;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-lg p-1.5 bg-violet-50 text-violet-600">
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-xs font-medium text-slate-700">{title}</p>
      </div>
      {row ? (
        <>
          <p className="text-base font-bold text-slate-900 truncate" title={row.name ?? row.label}>
            {row.name ?? row.label}
          </p>
          {row.id && row.id !== row.name ? (
            <p className="text-[10px] text-slate-500 font-mono truncate">ID: {row.id}</p>
          ) : null}
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm text-slate-700 font-medium">{fmtMoney(row.revenueUSD)}</span>
            <span className="text-[11px] text-slate-500">{row.paidCount} تبرع</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">لا توجد بيانات</p>
      )}
    </div>
  );
}

function StatusDistribution({
  dist,
}: {
  dist: Record<AttributionStatus, number>;
}) {
  const total = STATUS_ORDER.reduce((a, k) => a + (dist[k] ?? 0), 0);
  if (total === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-4">
        لا توجد تبرعات في الفترة المختارة
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden">
        {STATUS_ORDER.map((k) => {
          const v = dist[k] ?? 0;
          const w = (v / total) * 100;
          if (w === 0) return null;
          return <div key={k} style={{ width: `${w}%` }} className={STATUS_COLOR[k]} />;
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STATUS_ORDER.map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className={cn("inline-block w-2.5 h-2.5 rounded-full", STATUS_COLOR[k])} />
            <span className="text-slate-700">{ATTRIBUTION_STATUS_LABEL_AR[k]}</span>
            <span className="text-slate-500 ml-auto">{dist[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const Icon = RECOMMENDATION_ICON[rec.kind];
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col gap-2",
        RECOMMENDATION_SEVERITY_CLASS[rec.severity]
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "rounded-lg p-1.5 shrink-0",
            RECOMMENDATION_SEVERITY_ICON[rec.severity]
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{rec.title}</p>
          <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
            {rec.body}
          </p>
        </div>
      </div>
      {rec.target ? (
        <div className="rounded-md bg-white/60 border border-white/40 px-2 py-1 text-[11px] text-slate-700 truncate" title={rec.target.label}>
          <span className="text-slate-500">الهدف:</span> {rec.target.label}
        </div>
      ) : null}
      {rec.metrics && rec.metrics.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {rec.metrics.map((m) => (
            <span
              key={m.label}
              className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-white/40 px-2 py-0.5"
            >
              <span className="text-slate-500">{m.label}:</span>
              <span className="font-medium text-slate-800">{m.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OverviewTab({ filterQs }: Props) {
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<OverviewData>(`/api/admin/ads/overview?${filterQs}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ??
            "تعذر تحميل النظرة العامة للإعلانات"
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
        <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل النظرة العامة…
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

  const topPlatformLabel = data.topPlatform
    ? PLATFORM_LABEL_AR[data.topPlatform.platform ?? "organic"]
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-sky-900 leading-relaxed">
          تعتمد هذه الأرقام على التبرعات المدفوعة فعليًا داخل الموقع وبيانات
          UTM/click IDs/GA4. قد تختلف عن أرقام منصات الإعلانات بسبب attribution
          windows وview-through وmodeled conversions.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatsMetricCard
          title="إيرادات الإعلانات"
          value={data.adRevenueUSD}
          icon={Megaphone}
          accent="emerald"
          format="money"
          subtitle={`${data.paidAdCount} تبرع مدفوع`}
        />
        <StatsMetricCard
          title="إيرادات غير إعلانية"
          value={data.organicRevenueUSD}
          icon={Globe2}
          accent="slate"
          format="money"
          subtitle={`${data.paidOrganicCount} تبرع مدفوع`}
        />
        <StatsMetricCard
          title="إجمالي الإيرادات"
          value={data.totalRevenueUSD}
          icon={DollarSign}
          accent="blue"
          format="money"
          subtitle="مجموع المدفوع في الفترة"
        />
        <StatsMetricCard
          title="حصة الإعلانات من الإيراد"
          value={data.adShare * 100}
          icon={Activity}
          accent="violet"
          format="percent"
          subtitle="نسبة إيرادات الإعلانات إلى الإجمالي"
        />
        <StatsMetricCard
          title="سلامة التتبع"
          value={data.trackingHealthPct * 100}
          icon={ShieldCheck}
          accent={
            data.trackingHealthPct >= 0.8
              ? "emerald"
              : data.trackingHealthPct >= 0.5
              ? "amber"
              : "rose"
          }
          format="percent"
          subtitle={`${data.trackingErrorCount} تبرع به مشكلة تتبع`}
        />
        <StatsMetricCard
          title="محاولات فاشلة"
          value={data.failedCount}
          icon={AlertTriangle}
          accent="rose"
          format="number"
          subtitle="جميع المحاولات الفاشلة في الفترة"
        />
        <StatsMetricCard
          title="متبرعون جدد من الإعلانات"
          value={data.newDonorsFromAds}
          icon={UserPlus}
          accent="indigo"
          format="number"
          subtitle="أول تبرع لهم في الفترة + إعلان"
        />
        <StatsMetricCard
          title="متبرعون جدد عضوي"
          value={data.newDonorsOrganic}
          icon={Repeat}
          accent="teal"
          format="number"
          subtitle="أول تبرع لهم بدون إعلان"
        />
      </div>

      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          توزيع الإيرادات حسب جودة الإسناد
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {REVENUE_STATUS_CARDS.map((c) => (
            <div key={c.key} className={cn("rounded-lg border p-3", c.bg)}>
              <p className={cn("text-[11px]", c.text)}>{c.title}</p>
              <p className={cn("text-base font-bold mt-1", c.text)} dir="ltr">
                {fmtMoney(data.revenueByStatus[c.key] ?? 0)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {data.statusDistribution[c.key] ?? 0} تبرع
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <TopCard
          title={`أفضل منصة${topPlatformLabel ? ` — ${topPlatformLabel}` : ""}`}
          row={data.topPlatform}
          icon={Trophy}
        />
        <TopCard title="أفضل حملة" row={data.topCampaign} icon={Trophy} />
        <TopCard title="أفضل إعلان" row={data.topAd} icon={Trophy} />
        <TopCard
          title="أعلى دولة (حسب جنسية المتبرع)"
          row={data.topCountry}
          icon={Trophy}
        />
      </div>

      <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          توزيع حالة التتبع على التبرعات المدفوعة
        </h3>
        <StatusDistribution dist={data.statusDistribution} />
      </div>

      {data.recommendations && data.recommendations.length > 0 ? (
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-700">توصيات سريعة</h3>
            <span className="text-[10px] text-slate-500 mr-auto">
              مستندة فقط إلى بيانات الموقع — لا تحوي بيانات إنفاق من منصات
              الإعلان
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recommendations.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5" />
          <p className="text-[12px] text-slate-500">
            لا توجد توصيات تلقائية في الفترة الحالية — أضف فترة أوسع أو فعل
            تتبع أقوى للحصول على اقتراحات.
          </p>
        </div>
      )}
    </div>
  );
}
