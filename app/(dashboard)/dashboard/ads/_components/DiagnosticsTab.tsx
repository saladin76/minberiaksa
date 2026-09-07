"use client";

import * as React from "react";
import axios from "axios";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Search,
  X,
  AlertTriangle,
  Hash,
  Globe2,
  Wand2,
  Activity,
  EyeOff,
  Link2Off,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";
import {
  ATTRIBUTION_STATUS_LABEL_AR,
  type AttributionStatus,
  type ReasonEntry,
} from "@/lib/tracking/tracking-event-contract";
import { DiagnosticsDrawer } from "./DiagnosticsDrawer";

interface DiagnosticRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  amountUSD: number;
  platform: AdPlatform;
  platformLabel: string;
  sourceStatus: AttributionStatus;
  sourceStatusLabel: string;
  confidence: number;
  reasons: ReasonEntry[];
  warnings: ReasonEntry[];
  warningCount: number;
  donorId: string;
  campaignName: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
  hasIssue: boolean;
}

interface IssueCounts {
  total: number;
  capiMissing: number;
  capiFailedOnly: number;
  browserMissing: number;
  clickIdMissing: number;
  unresolvedMacros: number;
  ga4Missing: number;
  utmOnly: number;
  organicOrDirect: number;
  platformMismatch: number;
  trackingIssue: number;
}

interface ResponseShape {
  counts: Record<AttributionStatus, number>;
  issueCounts: IssueCounts;
  totalRows: number;
  rows: DiagnosticRow[];
  truncated: boolean;
}

interface Props {
  filterQs: string;
}

type IssueBucket =
  | "capi_missing"
  | "browser_missing"
  | "click_id_missing"
  | "unresolved_macros"
  | "ga4_missing"
  | "utm_only"
  | "organic_or_direct"
  | "tracking_issue";

const STATUS_PILL: Record<AttributionStatus, string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  strong: "bg-teal-50 text-teal-700 border-teal-200",
  likely_paid: "bg-lime-50 text-lime-700 border-lime-200",
  ga4_inferred: "bg-sky-50 text-sky-700 border-sky-200",
  utm_only: "bg-amber-50 text-amber-700 border-amber-200",
  organic: "bg-slate-50 text-slate-600 border-slate-200",
  direct: "bg-slate-50 text-slate-600 border-slate-200",
  tracking_issue: "bg-rose-50 text-rose-700 border-rose-200",
};

const ALL_STATUSES: AttributionStatus[] = [
  "verified",
  "strong",
  "likely_paid",
  "ga4_inferred",
  "utm_only",
  "organic",
  "direct",
  "tracking_issue",
];

const ISSUE_CARDS: {
  key: IssueBucket | "total";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  ringColor: string;
}[] = [
  {
    key: "total",
    title: "إجمالي أخطاء التتبع",
    icon: AlertTriangle,
    color: "text-rose-700 bg-rose-50 border-rose-200",
    ringColor: "ring-rose-500",
  },
  {
    key: "capi_missing",
    title: "CAPI ناقص",
    icon: Activity,
    color: "text-rose-700 bg-white border-slate-200",
    ringColor: "ring-rose-500",
  },
  {
    key: "browser_missing",
    title: "Browser Donate ناقص",
    icon: EyeOff,
    color: "text-amber-700 bg-white border-slate-200",
    ringColor: "ring-amber-500",
  },
  {
    key: "click_id_missing",
    title: "Click ID ناقص",
    icon: Link2Off,
    color: "text-amber-700 bg-white border-slate-200",
    ringColor: "ring-amber-500",
  },
  {
    key: "unresolved_macros",
    title: "Macros غير مستبدلة",
    icon: Wand2,
    color: "text-rose-700 bg-white border-slate-200",
    ringColor: "ring-rose-500",
  },
  {
    key: "ga4_missing",
    title: "GA4 ناقص",
    icon: Hash,
    color: "text-sky-700 bg-white border-slate-200",
    ringColor: "ring-sky-500",
  },
  {
    key: "utm_only",
    title: "UTM فقط",
    icon: ShieldQuestion,
    color: "text-amber-700 bg-white border-slate-200",
    ringColor: "ring-amber-500",
  },
  {
    key: "organic_or_direct",
    title: "غير إعلاني/مباشر",
    icon: Globe2,
    color: "text-slate-700 bg-white border-slate-200",
    ringColor: "ring-slate-500",
  },
];

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, numberingSystem: "latn" })}`;
}

function fmtIstanbul(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function issueCountValue(counts: IssueCounts, key: IssueBucket | "total"): number {
  switch (key) {
    case "total":
      return counts.total;
    case "capi_missing":
      return counts.capiMissing + counts.capiFailedOnly;
    case "browser_missing":
      return counts.browserMissing;
    case "click_id_missing":
      return counts.clickIdMissing;
    case "unresolved_macros":
      return counts.unresolvedMacros;
    case "ga4_missing":
      return counts.ga4Missing;
    case "utm_only":
      return counts.utmOnly;
    case "organic_or_direct":
      return counts.organicOrDirect;
    case "tracking_issue":
      return counts.trackingIssue;
  }
}

export function DiagnosticsTab({ filterQs }: Props) {
  const [data, setData] = React.useState<ResponseShape | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<AttributionStatus | "all">("all");
  const [issueFilter, setIssueFilter] = React.useState<IssueBucket | "all">("all");
  const [platformFilter, setPlatformFilter] = React.useState<AdPlatform | "all">("all");
  const [minConfidence, setMinConfidence] = React.useState<number>(0);
  const [maxConfidence, setMaxConfidence] = React.useState<number>(100);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [drawerId, setDrawerId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const visibleRows = React.useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (platformFilter !== "all") rows = rows.filter((r) => r.platform === platformFilter);
    if (minConfidence > 0) rows = rows.filter((r) => r.confidence >= minConfidence);
    if (maxConfidence < 100) rows = rows.filter((r) => r.confidence <= maxConfidence);
    if (!search) return rows;
    const needle = search.toLowerCase();
    return rows.filter((r) => {
      const haystack = [
        r.campaignName,
        r.campaignId,
        r.adId,
        r.adsetId,
        r.placement,
        r.platformLabel,
        r.sourceStatusLabel,
        r.donorId,
        r.id,
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [data, search, platformFilter, minConfidence, maxConfidence]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(filterQs);
    qs.set("onlyIssues", String(onlyIssues));
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (issueFilter !== "all") qs.set("issue", issueFilter);
    axios
      .get<ResponseShape>(`/api/admin/ads/diagnostics?${qs}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل تشخيص التتبع"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterQs, onlyIssues, statusFilter, issueFilter]);

  const openDrawer = (id: string) => {
    setDrawerId(id);
    setDrawerOpen(true);
  };

  const platformOptions: { v: AdPlatform | "all"; label: string }[] = [
    { v: "all", label: "كل المنصات" },
    { v: "meta", label: "Meta" },
    { v: "google", label: "Google" },
    { v: "tiktok", label: "TikTok" },
    { v: "x", label: "X" },
    { v: "other-paid", label: "إعلان آخر" },
    { v: "organic", label: "غير إعلاني" },
  ];

  return (
    <div className="space-y-3">
      {/* Issue breakdown cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {ISSUE_CARDS.map((c) => {
          const value = data ? issueCountValue(data.issueCounts, c.key) : 0;
          const active = c.key !== "total" && issueFilter === c.key;
          const Icon = c.icon;
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => {
                if (c.key === "total") {
                  setIssueFilter("all");
                  setOnlyIssues(true);
                } else {
                  const bucket: IssueBucket = c.key;
                  setIssueFilter((prev) => (prev === bucket ? "all" : bucket));
                  setOnlyIssues(false); // show even when status would normally hide
                }
              }}
              className={cn(
                "rounded-xl border p-2.5 text-right hover:shadow-sm transition-shadow",
                c.color,
                active && "ring-2",
                active && c.ringColor
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-600">{c.title}</p>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <p className="text-lg font-bold mt-1">{value}</p>
            </button>
          );
        })}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {ALL_STATUSES.map((k) => (
          <button
            type="button"
            key={k}
            onClick={() =>
              setStatusFilter((prev) => (prev === k ? "all" : k))
            }
            className={cn(
              "rounded-xl border bg-white p-2.5 text-right hover:shadow-sm transition-shadow",
              statusFilter === k && "ring-2 ring-brand",
              STATUS_PILL[k]
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium">{ATTRIBUTION_STATUS_LABEL_AR[k]}</p>
              {k === "verified" ? (
                <ShieldCheck className="w-3.5 h-3.5" />
              ) : k === "tracking_issue" ? (
                <ShieldAlert className="w-3.5 h-3.5" />
              ) : (
                <ShieldQuestion className="w-3.5 h-3.5" />
              )}
            </div>
            <p className="text-lg font-bold mt-1">{data?.counts[k] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ابحث في الحملة, المتبرع, الموضع, معرف التبرع..."
            className="w-full h-9 pr-8 pl-8 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
            className="accent-brand"
          />
          إظهار التبرعات التي بها مشكلة فقط
        </label>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as AdPlatform | "all")}
          className="h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
        >
          {platformOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 text-xs text-slate-700">
          <span className="text-slate-500">الثقة:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-14 h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
          />
          <span className="text-slate-400">—</span>
          <input
            type="number"
            min={0}
            max={100}
            value={maxConfidence}
            onChange={(e) => setMaxConfidence(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-14 h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
          />
        </div>

        {(statusFilter !== "all" || issueFilter !== "all" || platformFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setIssueFilter("all");
              setPlatformFilter("all");
              setMinConfidence(0);
              setMaxConfidence(100);
            }}
            className="text-xs text-brand hover:underline"
          >
            مسح كل الفلاتر
          </button>
        )}
        {data?.truncated && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
            عرض أحدث 500 صف — ضع فلتر فترة أضيق للحصول على القائمة كاملة
          </span>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : !data || visibleRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-slate-500">
          {search
            ? `لا توجد نتائج تطابق "${search}"`
            : onlyIssues
            ? "لا توجد تبرعات بها مشاكل تتبع في الفترة المختارة"
            : "لا توجد تبرعات في الفترة المختارة"}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">التاريخ</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحالة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحملة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المبلغ</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الثقة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">السبب الرئيسي</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">تحذيرات</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const primaryReason =
                    r.warnings[0]?.label ?? r.reasons[0]?.label ?? "—";
                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {fmtIstanbul(r.paidAt ?? r.createdAt)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium",
                            STATUS_PILL[r.sourceStatus]
                          )}
                        >
                          {r.sourceStatusLabel}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{PLATFORM_LABEL_AR[r.platform]}</td>
                      <td className="py-2 px-3 text-slate-700 max-w-[200px]">
                        {r.campaignName ? (
                          <div className="flex flex-col items-start">
                            <span className="truncate" title={r.campaignName}>
                              {r.campaignName}
                            </span>
                            {r.campaignId && r.campaignId !== r.campaignName ? (
                              <span className="font-mono text-[10px] text-slate-500 truncate">
                                ID: {r.campaignId}
                              </span>
                            ) : null}
                          </div>
                        ) : r.campaignId ? (
                          <span className="font-mono text-[10px] text-slate-500">
                            ID: {r.campaignId}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800" dir="ltr">
                        {r.status === "PAID" ? (
                          fmtMoney(r.amountUSD)
                        ) : (
                          <span className="text-rose-600">فشل</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 font-medium",
                            r.confidence >= 80
                              ? "text-emerald-700"
                              : r.confidence >= 40
                              ? "text-amber-700"
                              : "text-rose-700"
                          )}
                        >
                          {r.confidence}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 max-w-[260px]">
                        <span className="line-clamp-1" title={primaryReason}>
                          {primaryReason}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {r.warningCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {r.warningCount}
                          </span>
                        ) : (
                          <span className="text-emerald-700">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => openDrawer(r.id)}
                          className="inline-flex items-center gap-1 text-brand hover:underline text-[11px]"
                        >
                          إظهار
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DiagnosticsDrawer
        donationId={drawerId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
