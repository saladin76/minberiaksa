"use client";

import * as React from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  istanbulTodayKey,
  istanbulAddCalendarDaysKey,
} from "@/lib/dashboard/istanbul-client-date";
import { AdsFiltersBar, type AdsChartPeriod } from "./_components/AdsFiltersBar";
import { OverviewTab } from "./_components/OverviewTab";
import { BreakdownTable } from "./_components/BreakdownTable";
import { AcquisitionTab } from "./_components/AcquisitionTab";
import { DiagnosticsTab } from "./_components/DiagnosticsTab";
import { AdGroupsTab } from "./_components/AdGroupsTab";
import { ReconciliationTab } from "./_components/ReconciliationTab";

type TabKey =
  | "overview"
  | "platforms"
  | "campaigns"
  | "adGroups"
  | "ads"
  | "placements"
  | "countries"
  | "acquisition"
  | "diagnostics"
  | "reconciliation";

const TAB_LABELS: Record<TabKey, string> = {
  overview: "نظرة عامة",
  platforms: "المنصات",
  campaigns: "الحملات",
  adGroups: "مجموعات إعلانية",
  ads: "الإعلانات",
  placements: "المواضع",
  countries: "الدول",
  acquisition: "اكتساب المتبرعين",
  diagnostics: "تشخيص التتبع",
  reconciliation: "تسوية المنصات",
};

const TAB_ORDER: TabKey[] = [
  "overview",
  "platforms",
  "campaigns",
  "adGroups",
  "ads",
  "placements",
  "countries",
  "acquisition",
  "diagnostics",
  "reconciliation",
];

export default function AdsManagementPage() {
  const [period, setPeriod] = React.useState<AdsChartPeriod>("month");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<TabKey>("overview");

  const handlePeriodChange = React.useCallback((p: AdsChartPeriod) => {
    setPeriod(p);
    if (p === "custom") {
      const endKey = istanbulTodayKey();
      const startKey = istanbulAddCalendarDaysKey(endKey, -30);
      setDateFrom(startKey);
      setDateTo(endKey);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  }, []);

  const filterQs = React.useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("period", period);
    if (dateFrom && dateTo) {
      sp.set("start", dateFrom);
      sp.set("end", dateTo);
    }
    return sp.toString();
  }, [period, dateFrom, dateTo]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="rounded-xl p-2 bg-brand/10 text-brand">
            <Megaphone className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">إدارة الإعلانات</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              مركز التحليلات الإعلاني — يربط كل تبرع بالحملة والمنصة والإعلان الذي جلبه، ويقيس سلامة التتبع وفروقات الإسناد.
            </p>
          </div>
        </div>
        <AdsFiltersBar
          period={period}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onPeriodChange={handlePeriodChange}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-x-1 gap-y-1" aria-label="Tabs">
          {TAB_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActiveTab(k)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
                activeTab === k
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              )}
            >
              {TAB_LABELS[k]}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-[300px]">
        {activeTab === "overview" && <OverviewTab filterQs={filterQs} />}
        {activeTab === "platforms" && (
          <BreakdownTable
            filterQs={filterQs}
            dimension="platform"
            entityHeader="المنصة"
            emptyHint="لا توجد تبرعات في الفترة لتفصيلها حسب المنصة"
          />
        )}
        {activeTab === "campaigns" && (
          <BreakdownTable
            filterQs={filterQs}
            dimension="campaign"
            entityHeader="اسم الحملة (utm_campaign)"
            emptyHint="لا توجد حملات إعلانية مُسنَدة في الفترة"
          />
        )}
        {activeTab === "adGroups" && <AdGroupsTab filterQs={filterQs} />}
        {activeTab === "ads" && (
          <BreakdownTable
            filterQs={filterQs}
            dimension="ad"
            entityHeader="الإعلان (ad_id / utm_content)"
            emptyHint="لا توجد إعلانات مُسنَدة في الفترة"
          />
        )}
        {activeTab === "placements" && (
          <BreakdownTable
            filterQs={filterQs}
            dimension="placement"
            entityHeader="الموضع"
            emptyHint="لا توجد بيانات placement محفوظة على التبرعات في الفترة"
          />
        )}
        {activeTab === "countries" && (
          <BreakdownTable
            filterQs={filterQs}
            dimension="country"
            entityHeader="الدولة (حسب جنسية المتبرع)"
          />
        )}
        {activeTab === "acquisition" && <AcquisitionTab filterQs={filterQs} />}
        {activeTab === "diagnostics" && <DiagnosticsTab filterQs={filterQs} />}
        {activeTab === "reconciliation" && (
          <ReconciliationTab
            period={period}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        )}
      </div>
    </div>
  );
}
