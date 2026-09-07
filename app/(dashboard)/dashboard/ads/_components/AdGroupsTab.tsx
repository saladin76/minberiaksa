"use client";

import * as React from "react";
import axios from "axios";
import ReactCountryFlag from "react-country-flag";
import { Loader2, Search, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";
import type { AttributionStatus } from "@/lib/tracking/tracking-event-contract";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { DASHBOARD_DISPLAY_SYMBOLS } from "@/lib/dashboard/format-dashboard-money";

interface DonationListRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  amount: number;
  amountUSD: number;
  currency: string;
  donorCountryCode: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  placement: string | null;
  adsetId: string | null;
  adId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adName: string | null;
  platform: AdPlatform;
  platformLabel: string;
  sourceStatus: AttributionStatus;
  sourceStatusLabel: string;
  confidence: number;
  warningCount: number;
}

interface ResponseShape {
  rows: DonationListRow[];
  totalRows: number;
  truncated: boolean;
}

interface Props {
  filterQs: string;
}

type SortKey = "date" | "amountUSD" | "confidence";

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

const STATUS_DOT: Record<AttributionStatus, string> = {
  verified: "bg-emerald-500",
  strong: "bg-teal-500",
  likely_paid: "bg-lime-500",
  ga4_inferred: "bg-sky-500",
  utm_only: "bg-amber-400",
  organic: "bg-slate-300",
  direct: "bg-slate-400",
  tracking_issue: "bg-rose-500",
};

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

function fmtLocal(amount: number, currency: string) {
  const symbol = DASHBOARD_DISPLAY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 2, numberingSystem: "latn" })}`;
}

function fmtUsd(amount: number) {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0, numberingSystem: "latn" })}`;
}

function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => {});
  }
}

export function AdGroupsTab({ filterQs }: Props) {
  const [data, setData] = React.useState<ResponseShape | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "PAID" | "FAILED">("PAID");
  const [adFilter, setAdFilter] = React.useState<"all" | "ads" | "organic">("all");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<ResponseShape>(`/api/admin/ads/donations-list?${filterQs}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل قائمة التبرعات"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterQs]);

  // Debounce the search input so typing doesn't re-filter on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = React.useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (adFilter === "ads") rows = rows.filter((r) => r.platform !== "organic");
    if (adFilter === "organic") rows = rows.filter((r) => r.platform === "organic");
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((r) => {
        const haystack = [
          r.utmCampaign,
          r.utmTerm,
          r.utmContent,
          r.utmSource,
          r.utmMedium,
          r.placement,
          r.adId,
          r.adsetId,
          r.donorCountryCode,
          r.platformLabel,
          r.sourceStatusLabel,
          r.id,
        ]
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === "amountUSD") {
        return sortDir === "desc" ? b.amountUSD - a.amountUSD : a.amountUSD - b.amountUSD;
      }
      if (sortKey === "confidence") {
        return sortDir === "desc" ? b.confidence - a.confidence : a.confidence - b.confidence;
      }
      const at = a.paidAt ? Date.parse(a.paidAt) : Date.parse(a.createdAt);
      const bt = b.paidAt ? Date.parse(b.paidAt) : Date.parse(b.createdAt);
      return sortDir === "desc" ? bt - at : at - bt;
    });
    return sorted;
  }, [data, search, sortKey, sortDir, statusFilter, adFilter]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const totals = React.useMemo(() => {
    let revenueUSD = 0;
    let paidCount = 0;
    let failedCount = 0;
    const platforms = new Map<AdPlatform, number>();
    const terms = new Map<string, number>();
    for (const r of filtered) {
      if (r.status === "PAID") {
        revenueUSD += r.amountUSD;
        paidCount += 1;
        platforms.set(r.platform, (platforms.get(r.platform) ?? 0) + 1);
        if (r.utmTerm) terms.set(r.utmTerm, (terms.get(r.utmTerm) ?? 0) + 1);
      } else if (r.status === "FAILED") {
        failedCount += 1;
      }
    }
    return {
      revenueUSD,
      paidCount,
      failedCount,
      platformsCount: platforms.size,
      distinctTerms: terms.size,
    };
  }, [filtered]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل قائمة التبرعات…
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

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-white p-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث في utm_term, utm_campaign, الإعلان, الدولة..."
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
          <div className="flex items-center gap-1.5">
            {(["all", "PAID", "FAILED"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={cn(
                  "h-9 px-3 text-xs rounded-lg border transition-colors",
                  statusFilter === k
                    ? "bg-brand text-white border-brand"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                )}
              >
                {k === "all" ? "الكل" : k === "PAID" ? "مدفوع" : "فاشل"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {([
              { k: "all", label: "إعلاني + عضوي" },
              { k: "ads", label: "إعلاني فقط" },
              { k: "organic", label: "عضوي فقط" },
            ] as const).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setAdFilter(k)}
                className={cn(
                  "h-9 px-3 text-xs rounded-lg border transition-colors",
                  adFilter === k
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <p className="text-emerald-700 text-[11px]">إيرادات (USD)</p>
            <p className="text-emerald-900 font-bold mt-0.5">{fmtUsd(totals.revenueUSD)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="text-blue-700 text-[11px]">تبرعات مدفوعة</p>
            <p className="text-blue-900 font-bold mt-0.5">{totals.paidCount}</p>
          </div>
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
            <p className="text-rose-700 text-[11px]">محاولات فاشلة</p>
            <p className="text-rose-900 font-bold mt-0.5">{totals.failedCount}</p>
          </div>
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
            <p className="text-violet-700 text-[11px]">منصات</p>
            <p className="text-violet-900 font-bold mt-0.5">{totals.platformsCount}</p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-amber-700 text-[11px]">قيم utm_term</p>
            <p className="text-amber-900 font-bold mt-0.5">{totals.distinctTerms}</p>
          </div>
        </div>

        {data?.truncated && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-block">
            عرض أحدث 2000 تبرع — ضع فلتر فترة أضيق للحصول على القائمة كاملة
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto" dir="rtl">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort("date")}
                    className="inline-flex items-center gap-1 hover:text-brand"
                  >
                    التاريخ
                    <ArrowUpDown className={cn("w-3 h-3", sortKey === "date" ? "text-brand" : "text-slate-400")} />
                  </button>
                </th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort("amountUSD")}
                    className="inline-flex items-center gap-1 hover:text-brand"
                  >
                    المبلغ
                    <ArrowUpDown className={cn("w-3 h-3", sortKey === "amountUSD" ? "text-brand" : "text-slate-400")} />
                  </button>
                </th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">الدولة</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة / الحالة</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">utm_campaign</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">
                  utm_term (الكلمة المفتاحية)
                </th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">الإعلان / الموضع</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort("confidence")}
                    className="inline-flex items-center gap-1 hover:text-brand"
                  >
                    الثقة
                    <ArrowUpDown className={cn("w-3 h-3", sortKey === "confidence" ? "text-brand" : "text-slate-400")} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    {search
                      ? `لا توجد نتائج تطابق "${search}"`
                      : "لا توجد تبرعات في الفترة المختارة"}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const countryName = r.donorCountryCode
                    ? getCountryDisplayNameFromCode(r.donorCountryCode, "ar") ?? r.donorCountryCode
                    : null;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {fmtIstanbul(r.paidAt ?? r.createdAt)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap" dir="ltr">
                        {r.status === "PAID" ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="font-semibold text-slate-900">
                              {fmtLocal(r.amount, r.currency)}
                            </span>
                            {r.currency !== "USD" && (
                              <span className="text-[10px] text-slate-500">
                                ≈ {fmtUsd(r.amountUSD)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-rose-600">فشل</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {r.donorCountryCode ? (
                          <span className="inline-flex items-center gap-1.5">
                            {/^[A-Z]{2}$/.test(r.donorCountryCode) ? (
                              <ReactCountryFlag
                                countryCode={r.donorCountryCode}
                                svg
                                style={{ width: "1.05em", height: "1.05em" }}
                              />
                            ) : null}
                            <span className="text-slate-700">{countryName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap",
                              STATUS_PILL[r.sourceStatus]
                            )}
                          >
                            <span
                              className={cn("inline-block w-1.5 h-1.5 rounded-full", STATUS_DOT[r.sourceStatus])}
                              aria-hidden
                            />
                            {PLATFORM_LABEL_AR[r.platform]}
                          </span>
                          {r.platform !== "organic" && (
                            <span className="text-[10px] text-slate-500">{r.sourceStatusLabel}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 max-w-[180px]">
                        {r.utmCampaign ? (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(r.utmCampaign!)}
                            title={`${r.utmCampaign} — اضغط للنسخ`}
                            className="text-right truncate block text-slate-700 hover:text-brand hover:underline"
                          >
                            {r.utmCampaign}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 max-w-[180px]">
                        {r.utmTerm ? (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(r.utmTerm!)}
                            title={`${r.utmTerm} — اضغط للنسخ`}
                            className="text-right truncate block font-medium text-slate-800 hover:text-brand hover:underline"
                          >
                            {r.utmTerm}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 max-w-[200px]">
                        <div className="flex flex-col items-start gap-0.5">
                          {r.utmContent ? (
                            <span className="text-slate-700 truncate max-w-full" title={r.utmContent}>
                              {r.utmContent}
                            </span>
                          ) : r.adId ? (
                            <span className="font-mono text-[10px] text-slate-500 truncate" title={r.adId}>
                              {r.adId}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                          {r.placement && (
                            <span className="text-[10px] text-slate-500 truncate" title={r.placement}>
                              {r.placement}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            "font-medium",
                            r.confidence >= 80
                              ? "text-emerald-700"
                              : r.confidence >= 40
                              ? "text-amber-700"
                              : r.confidence > 0
                              ? "text-rose-700"
                              : "text-slate-400"
                          )}
                        >
                          {r.confidence}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        المعروض {filtered.length} من {data?.totalRows ?? 0} تبرع في الفترة
      </p>
    </div>
  );
}
