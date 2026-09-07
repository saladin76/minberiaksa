"use client";

import * as React from "react";
import axios from "axios";
import ReactCountryFlag from "react-country-flag";
import { Loader2, ArrowUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import type { BreakdownDimension } from "@/lib/attribution/aggregate";

interface BreakdownRow {
  key: string;
  label: string;
  name: string | null;
  id: string | null;
  platform: AdPlatform | null;
  revenueUSD: number;
  paidCount: number;
  failedCount: number;
  totalAttempts: number;
  avgDonationUSD: number;
  paymentSuccessRate: number;
  trackingHealthPct: number;
  avgConfidence: number;
  uniqueDonors: number;
  newDonors: number;
  returningDonors: number;
  revenueShare: number;
  donationShare: number;
  bestPlatform: {
    key: AdPlatform;
    label: string;
    revenueUSD: number;
    share: number;
  } | null;
  bestPlacement: {
    key: string;
    label: string;
    revenueUSD: number;
    share: number;
  } | null;
  bestCampaign: { key: string; label: string; revenueUSD: number } | null;
  bestAd: { key: string; label: string; revenueUSD: number } | null;
  adRevenueShare: number;
}

interface ResponseShape {
  dimension: BreakdownDimension;
  rows: BreakdownRow[];
  totalRowCount: number;
}

interface Props {
  filterQs: string;
  dimension: BreakdownDimension;
  /** Column header label for the first (entity) column. */
  entityHeader: string;
  /** Optional empty-state hint. */
  emptyHint?: string;
}

type SortKey =
  | "revenueUSD"
  | "paidCount"
  | "failedCount"
  | "avgDonationUSD"
  | "paymentSuccessRate"
  | "trackingHealthPct"
  | "uniqueDonors"
  | "newDonors"
  | "returningDonors"
  | "revenueShare";

const PLATFORM_PILL_COLOR: Record<AdPlatform, string> = {
  meta: "bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/20",
  google: "bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/20",
  tiktok: "bg-slate-900/10 text-slate-900 border-slate-300",
  x: "bg-slate-900/10 text-slate-900 border-slate-300",
  snapchat: "bg-[#FFFC00]/30 text-amber-700 border-amber-300",
  linkedin: "bg-[#0A66C2]/10 text-[#0A66C2] border-[#0A66C2]/20",
  reddit: "bg-[#FF4500]/10 text-[#FF4500] border-[#FF4500]/20",
  "other-paid": "bg-violet-100 text-violet-700 border-violet-200",
  organic: "bg-slate-100 text-slate-600 border-slate-200",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0, numberingSystem: "latn" })}`;
}
function fmtMoneyPrecise(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, numberingSystem: "latn" })}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function HealthDot({ value }: { value: number }) {
  const cls = value >= 0.8 ? "bg-emerald-500" : value >= 0.5 ? "bg-amber-400" : "bg-rose-500";
  return <span className={cn("inline-block w-2 h-2 rounded-full", cls)} aria-hidden />;
}

function PlatformPill({ platform }: { platform: AdPlatform | null }) {
  if (!platform) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium",
        PLATFORM_PILL_COLOR[platform]
      )}
    >
      {PLATFORM_LABEL_AR[platform]}
    </span>
  );
}

function NameIdCell({ row, dimension }: { row: BreakdownRow; dimension: BreakdownDimension }) {
  if (dimension === "country") {
    if (row.key === "__unset") return <span className="text-slate-400">غير محدد</span>;
    return (
      <span className="inline-flex items-center gap-1.5">
        {/^[A-Z]{2}$/.test(row.key) ? (
          <ReactCountryFlag countryCode={row.key} svg style={{ width: "1.1em", height: "1.1em" }} />
        ) : null}
        <span>{getCountryDisplayNameFromCode(row.key, "ar") ?? row.label}</span>
        <span className="text-[10px] text-slate-400">({row.key})</span>
      </span>
    );
  }
  if (dimension === "campaign" || dimension === "adset" || dimension === "ad") {
    const name = row.name;
    const id = row.id;
    const showId = id && id !== name;
    return (
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className="font-medium text-slate-900 truncate max-w-[260px]" title={name ?? id ?? row.label}>
          {name ?? (dimension === "campaign" ? "حملة بدون اسم" : dimension === "adset" ? "مجموعة بدون اسم" : "إعلان بدون اسم")}
        </span>
        <span className="font-mono text-[10px] text-slate-500 truncate max-w-[260px]">
          ID: {showId ? id : "—"}
        </span>
      </div>
    );
  }
  return <span className="truncate" title={row.label}>{row.label}</span>;
}

export function BreakdownTable({ filterQs, dimension, entityHeader, emptyHint }: Props) {
  const [rows, setRows] = React.useState<BreakdownRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("revenueUSD");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  // Reset search when switching dimensions so a leftover query from the
  // previous tab doesn't accidentally hide everything in the new one.
  React.useEffect(() => {
    setSearchInput("");
    setSearch("");
  }, [dimension]);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<ResponseShape>(`/api/admin/ads/breakdown?dimension=${dimension}&${filterQs}`)
      .then((r) => {
        if (!cancelled) setRows(r.data.rows ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          (e?.response?.data?.error as string | undefined) ?? "تعذر تحميل التحليل التفصيلي"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterQs, dimension]);

  const sortedRows = React.useMemo(() => {
    if (!rows) return null;
    let out = rows;
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((r) => {
        const hay = [r.label, r.key, r.name, r.id]
          .filter((v): v is string => !!v)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    out = [...out];
    out.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [rows, sortKey, sortDir, search]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

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

  const searchBar = (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={`ابحث في ${entityHeader}…`}
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
  );

  if (!sortedRows || (sortedRows.length === 0 && !rows?.length)) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-slate-500">
          {emptyHint ?? "لا توجد بيانات في الفترة المختارة"}
        </div>
      </div>
    );
  }

  const SortableHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-brand"
      >
        {children}
        <ArrowUpDown className={cn("w-3 h-3", sortKey === k ? "text-brand" : "text-slate-400")} />
      </button>
    </th>
  );

  const isCountry = dimension === "country";
  const isPlacement = dimension === "placement";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {searchBar}
        <span className="text-[11px] text-slate-500">
          {search
            ? `${sortedRows.length} نتيجة من ${rows?.length ?? 0}`
            : `${sortedRows.length} ${sortedRows.length === 1 ? "صف" : "صفًا"}`}
        </span>
      </div>
      {sortedRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-slate-500">
          لا توجد نتائج تطابق &laquo;{search}&raquo;
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">{entityHeader}</th>
                  {!isCountry && dimension !== "platform" && (
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  )}
                  {isCountry && (
                    <>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">أفضل منصة</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">أفضل موضع</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">أفضل حملة</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">أفضل إعلان</th>
                    </>
                  )}
                  <SortableHead k="revenueUSD">الإيرادات</SortableHead>
                  {(isCountry || isPlacement) && (
                    <SortableHead k="revenueShare">حصة الإيرادات</SortableHead>
                  )}
                  <SortableHead k="paidCount">تبرعات مدفوعة</SortableHead>
                  {isPlacement && (
                    <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      حصة التبرعات
                    </th>
                  )}
                  <SortableHead k="failedCount">محاولات فاشلة</SortableHead>
                  <SortableHead k="avgDonationUSD">متوسط التبرع</SortableHead>
                  <SortableHead k="paymentSuccessRate">معدل النجاح</SortableHead>
                  <SortableHead k="trackingHealthPct">سلامة التتبع</SortableHead>
                  {isCountry && (
                    <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      حصة الإعلانات
                    </th>
                  )}
                  <SortableHead k="uniqueDonors">متبرعون</SortableHead>
                  <SortableHead k="newDonors">جدد</SortableHead>
                  {isPlacement && <SortableHead k="returningDonors">عائدون</SortableHead>}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-900 max-w-[300px]">
                      <NameIdCell row={r} dimension={dimension} />
                    </td>
                    {!isCountry && dimension !== "platform" && (
                      <td className="py-2 px-3">
                        <PlatformPill platform={r.platform} />
                      </td>
                    )}
                    {isCountry && (
                      <>
                        <td className="py-2 px-3">
                          {r.bestPlatform ? (
                            <div className="flex flex-col items-start gap-0.5">
                              <PlatformPill platform={r.bestPlatform.key} />
                              <span className="text-[10px] text-slate-500">
                                {fmtPct(r.bestPlatform.share)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-[180px]">
                          {r.bestPlacement ? (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="truncate text-slate-700" title={r.bestPlacement.label}>
                                {r.bestPlacement.label}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {fmtPct(r.bestPlacement.share)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-[160px]">
                          {r.bestCampaign ? (
                            <span className="truncate text-slate-700 block" title={r.bestCampaign.label}>
                              {r.bestCampaign.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-[160px]">
                          {r.bestAd ? (
                            <span className="truncate text-slate-700 block" title={r.bestAd.label}>
                              {r.bestAd.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="py-2 px-3 font-semibold text-slate-800" dir="ltr">
                      {fmtMoney(r.revenueUSD)}
                    </td>
                    {(isCountry || isPlacement) && (
                      <td className="py-2 px-3 text-slate-700">
                        {fmtPct(r.revenueShare)}
                      </td>
                    )}
                    <td className="py-2 px-3 text-slate-700">{r.paidCount}</td>
                    {isPlacement && (
                      <td className="py-2 px-3 text-slate-700">{fmtPct(r.donationShare)}</td>
                    )}
                    <td className="py-2 px-3 text-slate-700">
                      {r.failedCount > 0 ? (
                        <span className="text-rose-600">{r.failedCount}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-700" dir="ltr">
                      {r.paidCount > 0 ? fmtMoneyPrecise(r.avgDonationUSD) : "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      {r.totalAttempts > 0 ? fmtPct(r.paymentSuccessRate) : "—"}
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        {r.paidCount > 0 ? <HealthDot value={r.trackingHealthPct} /> : null}
                        {r.paidCount > 0 ? fmtPct(r.trackingHealthPct) : "—"}
                      </span>
                    </td>
                    {isCountry && (
                      <td className="py-2 px-3 text-slate-700">
                        {r.revenueUSD > 0 ? fmtPct(r.adRevenueShare) : "—"}
                      </td>
                    )}
                    <td className="py-2 px-3 text-slate-700">{r.uniqueDonors}</td>
                    <td className="py-2 px-3 text-slate-700">
                      {r.newDonors > 0 ? (
                        <span className="text-emerald-700 font-medium">{r.newDonors}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    {isPlacement && (
                      <td className="py-2 px-3 text-slate-700">
                        {r.returningDonors > 0 ? (
                          <span className="text-blue-700 font-medium">{r.returningDonors}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
