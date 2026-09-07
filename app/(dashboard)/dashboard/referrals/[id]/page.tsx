"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  Calendar,
  Repeat,
  Receipt,
  HandCoins,
  Percent,
  Loader2,
  ArrowRight,
  BarChart3,
  PieChart as PieChartIcon,
  Search,
  ChevronDown,
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  createFormatDashboardMoney,
  donationDisplayTotalLocal,
} from "@/lib/dashboard/format-dashboard-money";
import { formatIstanbulCalendarMonthLong } from "@/lib/admin/current-calendar-month-utc";
import { StatsMetricCard } from "@/components/dashboard/StatsMetricCard";
import { getDashboardChartPeriodLabelAr } from "@/lib/dashboard/chart-period-label-ar";
import { getPeriodDateKeys } from "@/lib/dashboard/period-date-range";
import {
  istanbulTodayKey,
  istanbulAddCalendarDaysKey,
  formatIstanbulDateKeyLabel,
} from "@/lib/dashboard/istanbul-client-date";
import { DonationTableCountryColumn } from "@/components/dashboard/DonationTableCountryColumn";
import { DonationSourceBadge } from "@/components/dashboard/DonationSourceBadge";
import { DonationsFilterActions } from "@/components/dashboard/DonationsFilterActions";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { DashboardPieLegendByValue } from "@/components/dashboard/DashboardPieLegend";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import DonationDetailsDialog, { type DonationDetailsTarget } from "@/components/dashboard/DonationDetailsDialog";
import { ExportReportDialog, EXPORT_DEFAULTS } from "@/components/dashboard/ExportReportDialog";
import { useDonationActions } from "@/components/dashboard/donations/useDonationActions";
import { userCanEditDonations, userCanExportReports } from "@/lib/dashboard/permissions";
import { useSession } from "next-auth/react";

interface ChartDataPoint {
  date: string;
  amountUSD: number;
  count: number;
  amountOneTime: number;
  countOneTime: number;
  amountMonthly: number;
  countMonthly: number;
  teamSupport: number;
  fees: number;
}

interface Category {
  id: string;
  name: string;
}

interface CampaignOption {
  id: string;
  title: string;
  // Many-to-many: a campaign can belong to multiple categories.
  categoryId?: string;
  categoryIds?: string[];
}

interface DonationRow {
  id: string;
  totalAmount: number;
  amount: number;
  amountUSD?: number | null;
  currency: string;
  teamSupport: number;
  fees: number;
  type: string;
  status: string;
  paidAt?: string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  providerErrorMessage?: string | null;
  paymentMethod?: string | null;
  attribution?: Record<string, unknown> | null;
  conversionEventsSentAt?: string | null;
  conversionFailedEventsSentAt?: string | null;
  createdAt: string;
  donor: { id: string; name: string | null; email: string };
  donorCountryCode?: string | null;
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
}

interface ReferralStats {
  referral: { id: string; code: string; name: string | null };
  totalDonations: number;
  paidCount?: number;
  failedCount?: number;
  failedTotalAmount?: number;
  totalAmount: number;
  allTimeRevenue?: number;
  /** All PAID for this referral (USD) - ignores category/campaign filters */
  paidRevenueAllTimeUnfiltered?: number;
  oneTimeCount: number;
  monthlyCount: number;
  oneTimeAllCount?: number;
  monthlyAllCount?: number;
  activeMonthlyCount: number;
  monthlyStoppedCount?: number;
  monthlyRecurringRevenue: number;
  activeMonthlyAmountUSD?: number;
  monthlyStoppedAmountUSD?: number;
  thisMonthRevenue: number;
  oneTimeTotalAmount?: number;
  monthlyTotalAmount?: number;
  campaignDonationsTotal?: number;
  categoryDonationsTotal?: number;
  campaignDonationsCount?: number;
  categoryDonationsCount?: number;
  teamSupportTotal?: number;
  feesTotal?: number;
  recentDonations: Array<{
    id: string;
    amount: number;
    currency: string;
    donorName: string;
    type: string;
    campaignTitle: string | null;
    categoryName: string | null;
    createdAt: string;
  }>;
}

type ChartViewType = "bar" | "line" | "area";
type ChartPeriod = "day" | "yesterday" | "week" | "month" | "year" | "all" | "custom";
type ChartMetric = "amount" | "teamSupport" | "fees";
type StatCardSet = "revenue" | "overview" | "breakdown";

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  day: "اليوم",
  yesterday: "أمس",
  week: "أسبوع",
  month: "شهر",
  year: "سنة",
  all: "كل الوقت",
  custom: "مخصص",
};

const CHART_COLORS = {
  primary: "#2563eb",
  primaryLight: "#93c5fd",
  secondary: "#1d4ed8",
  grid: "#e2e8f0",
  text: "#334155",
};

const DASHBOARD_CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  SAR: "﷼",
  AED: "د.إ",
  KWD: "د.ك",
  EGP: "EGP ",
  QAR: "﷼",
  BHD: "ب.د",
  OMR: "ر.ع.‏",
};

const PAGE_SIZE = 10;

function getDonationsDateRange(
  period: ChartPeriod,
  dateFrom: string,
  dateTo: string
): { start: string | null; end: string | null } {
  return getPeriodDateKeys(period, dateFrom, dateTo);
}

export default function ReferralAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale() as string;
  const thisMonthRevenueTitle = `إيرادات شهر ${formatIstanbulCalendarMonthLong(new Date(), locale || "ar")}`;
  const { convertToCurrency, getSelectedCurrency } = useCurrency();
  const id = params?.id as string | undefined;
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [statCardSet, setStatCardSet] = useState<StatCardSet>("revenue");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartView, setChartView] = useState<ChartViewType>("bar");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("amount");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [donationsSortBy, setDonationsSortBy] = useState<"date" | "amount">("date");
  const [donationsSortOrder, setDonationsSortOrder] = useState<"asc" | "desc">("desc");
  const [donationsStatusFilter, setDonationsStatusFilter] = useState<"all" | "PAID" | "FAILED">("all");
  const [donationsTypeFilter, setDonationsTypeFilter] = useState<"all" | "ONE_TIME" | "MONTHLY">("all");
  const [donationCountryFilter, setDonationCountryFilter] = useState<string>("all");
  const [countryOptions, setCountryOptions] = useState<{ code: string; count: number }[]>([]);
  const [countryUnsetCount, setCountryUnsetCount] = useState(0);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [donationsPage, setDonationsPage] = useState(1);
  const [donationsTotal, setDonationsTotal] = useState(0);
  const [donationsLoading, setDonationsLoading] = useState(false);
  const [donationsFetchedOnce, setDonationsFetchedOnce] = useState(false);
  const [searchCampaign, setSearchCampaign] = useState("");
  const [donationDetails, setDonationDetails] = useState<{
    open: boolean;
    mode: "attribution" | "payment" | "error";
    donation: DonationDetailsTarget | null;
  }>({ open: false, mode: "attribution", donation: null });
  const openDonationDetails = (mode: "attribution" | "payment" | "error", d: DonationRow) => {
    setDonationDetails({
      open: true,
      mode,
      donation: {
        id: d.id,
        provider: d.provider ?? null,
        providerOrderId: d.providerOrderId ?? null,
        providerErrorMessage: d.providerErrorMessage ?? null,
        paymentMethod: d.paymentMethod ?? null,
        attribution: d.attribution ?? null,
        conversionEventsSentAt: d.conversionEventsSentAt ?? null,
        conversionFailedEventsSentAt: d.conversionFailedEventsSentAt ?? null,
        status: d.status ?? null,
      },
    });
  };

  const chartFilterPeriodLabelAr = useMemo(
    () => getDashboardChartPeriodLabelAr(chartPeriod, dateFrom, dateTo),
    [chartPeriod, dateFrom, dateTo]
  );

  // Export dialog state — popup with full filter setup before download. Defaults
  // mirror the current page filters so the export reflects what's on screen.
  const [exportOpen, setExportOpen] = useState(false);

  // Fetch categories and campaigns
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [categoriesRes, campaignsRes] = await Promise.all([
          fetch("/api/categories?locale=ar&counts=true&limit=200"),
          fetch("/api/campaigns/all?locale=ar&isActiveFalse=true"),
        ]);
        const categoriesJson = await categoriesRes.json();
        const campaignsJson = await campaignsRes.json();
        setCategories(categoriesJson?.items ?? categoriesJson ?? []);
        setCampaigns(campaignsJson?.items ?? campaignsJson ?? []);
      } catch (error) {
        console.error("Error fetching filters:", error);
      }
    };
    fetchFilters();
  }, []);

  // Fetch distinct donor countries (scoped to this referral)
  const fetchCountries = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/donations/countries?referralId=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCountryOptions(Array.isArray(data?.countries) ? data.countries : []);
      setCountryUnsetCount(Number(data?.unsetCount) || 0);
    } catch (error) {
      console.error("Error fetching donor countries:", error);
    }
  }, [id]);

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  // Stats
  const fetchStats = useCallback(async () => {
    if (!id) return;
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("period", chartPeriod);
      const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
      if (start && end) {
        searchParams.set("start", start);
        searchParams.set("end", end);
      }
      if (selectedCategory !== "all") searchParams.set("categoryId", selectedCategory);
      if (selectedCampaign !== "all") searchParams.set("campaignId", selectedCampaign);
      if (donationCountryFilter !== "all") searchParams.set("country", donationCountryFilter);
      const res = await fetch(`/api/admin/referrals/${id}/stats?${searchParams}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          router.replace("/dashboard/referrals");
          return;
        }
        toast.error("فشل في تحميل إحصائيات الرابط");
        return;
      }
      setStats(data);
    } catch {
      toast.error("فشل في تحميل إحصائيات الرابط");
    } finally {
      setLoading(false);
    }
  }, [id, chartPeriod, dateFrom, dateTo, selectedCategory, selectedCampaign, donationCountryFilter, router]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Chart
  const fetchChart = useCallback(async () => {
    if (!id) return;
    setChartLoading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("period", chartPeriod);
      const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
      if (start && end) {
        searchParams.set("start", start);
        searchParams.set("end", end);
      }
      if (selectedCategory !== "all") searchParams.set("categoryId", selectedCategory);
      if (selectedCampaign !== "all") searchParams.set("campaignId", selectedCampaign);
      if (donationCountryFilter !== "all") searchParams.set("country", donationCountryFilter);
      const res = await fetch(`/api/admin/referrals/${id}/chart?${searchParams}`);
      if (!res.ok) return;
      const data = await res.json();
      setChartData(Array.isArray(data) ? data : []);
    } catch {
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [id, chartPeriod, dateFrom, dateTo, selectedCategory, selectedCampaign, donationCountryFilter]);

  useEffect(() => {
    fetchChart();
  }, [fetchChart]);

  const fetchDonations = useCallback(
    async (page: number, append: boolean) => {
      if (!id) return;
      setDonationsLoading(true);
      try {
        const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
        const searchParams = new URLSearchParams();
        searchParams.set("referralId", id);
        searchParams.set("page", String(page));
        searchParams.set("limit", String(PAGE_SIZE));
        searchParams.set("sortBy", donationsSortBy);
        searchParams.set("sortOrder", donationsSortOrder);
        if (selectedCategory !== "all") searchParams.append("categoryId", selectedCategory);
        if (selectedCampaign !== "all") searchParams.append("campaignId", selectedCampaign);
        if (start) searchParams.set("start", start);
        if (end) searchParams.set("end", end);
        if (donationsStatusFilter !== "all") searchParams.set("status", donationsStatusFilter);
        if (donationsTypeFilter !== "all") searchParams.set("donationType", donationsTypeFilter);
        if (donationCountryFilter !== "all") searchParams.set("country", donationCountryFilter);
        const res = await fetch(`/api/donations?${searchParams}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || "فشل في تحميل التبرعات");
          return;
        }
        const list = Array.isArray(data.donations) ? data.donations : [];
        setDonations((prev) => (append ? [...prev, ...list] : list));
        setDonationsTotal(data.pagination?.total ?? 0);
      } catch {
        toast.error("فشل في تحميل التبرعات");
      } finally {
        setDonationsLoading(false);
        setDonationsFetchedOnce(true);
      }
    },
    [id, selectedCategory, selectedCampaign, chartPeriod, dateFrom, dateTo, donationsSortBy, donationsSortOrder, donationsStatusFilter, donationsTypeFilter, donationCountryFilter]
  );

  useEffect(() => {
    if (!id || loading) return;
    setDonationsPage(1);
    fetchDonations(1, false);
  }, [id, loading, selectedCategory, selectedCampaign, chartPeriod, dateFrom, dateTo, donationsSortBy, donationsSortOrder, donationsStatusFilter, donationsTypeFilter, donationCountryFilter, fetchDonations]);

  const loadMoreDonations = () => {
    const next = donationsPage + 1;
    setDonationsPage(next);
    fetchDonations(next, true);
  };

  const hasMoreDonations = donations.length < donationsTotal && !donationsLoading;

  // Right-click edit/delete on donation rows (gated on donationsEdit perm).
  const { data: sessionForActions } = useSession();
  const canEditDonations = userCanEditDonations(sessionForActions?.user);
  const canExportReports = userCanExportReports(sessionForActions?.user);
  const refreshAfterDonationMutation = useCallback(() => {
    setDonationsPage(1);
    void Promise.all([
      fetchDonations(1, false),
      fetchStats(),
      fetchChart(),
      fetchCountries(),
    ]);
  }, [fetchDonations, fetchStats, fetchChart, fetchCountries]);
  const donationActions = useDonationActions({
    enabled: canEditDonations,
    onChange: refreshAfterDonationMutation,
  });

  const formatMoney = useMemo(
    () =>
      createFormatDashboardMoney({
        getSelectedCurrency,
        convertToCurrency,
      }),
    [getSelectedCurrency, convertToCurrency]
  );

  const { openUserProfile } = useViewUserProfile();

  if (!id) return null;
  if (loading && !stats) {
    return (
      <div className="min-h-[400px] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!stats) return null;

  const { referral } = stats;
  const oneTimeTotal = stats.oneTimeTotalAmount ?? 0;
  const monthlyTotal = stats.monthlyTotalAmount ?? 0;
  const revenueSplitData = [
    { name: "مشاريع", value: stats.campaignDonationsTotal ?? 0, count: stats.campaignDonationsCount ?? 0, color: "#2563eb" },
    { name: "فئات", value: stats.categoryDonationsTotal ?? 0, count: stats.categoryDonationsCount ?? 0, color: "#64748b" },
  ].filter((d) => d.value > 0 || d.count > 0);
  const typeSplitData = [
    { name: "مرة واحدة", value: oneTimeTotal, count: stats.oneTimeCount ?? 0, color: "#3b82f6" },
    { name: "شهرية", value: monthlyTotal, count: stats.monthlyCount ?? 0, color: "#1d4ed8" },
  ].filter((d) => d.value > 0 || d.count > 0);

  return (
    <div className="min-h-0" dir="rtl">
      <div className="space-y-6 sm:space-y-8 p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-right">
            <Link href="/dashboard/referrals" className="text-sm text-primary hover:underline inline-flex items-center gap-1 mb-1">
              <ArrowRight className="w-4 h-4" />
              العودة إلى قائمة الورابط
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              تحليل الرابط: {referral.name || referral.code}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              رمز التتبع: <code className="bg-muted px-1 rounded">{referral.code}</code>
            </p>
          </div>
        </header>

        {/* المؤشرات */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 flex-row-reverse">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              المؤشرات (حسب الفترة والتصفية)
            </h2>
            <Tabs value={statCardSet} onValueChange={(v) => setStatCardSet(v as StatCardSet)} className="w-auto">
              <TabsList className="bg-muted p-1 rounded-lg h-9" dir="rtl">
                <TabsTrigger value="revenue" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">الإيرادات</TabsTrigger>
                <TabsTrigger value="overview" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">نظرة عامة</TabsTrigger>
                <TabsTrigger value="breakdown" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm">تفصيل التبرعات</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-3">
            {statCardSet === "revenue" && (
              <>
                <StatsMetricCard
                  compact
                  title={thisMonthRevenueTitle}
                  value={stats.thisMonthRevenue ?? 0}
                  icon={Calendar}
                  accent="emerald"
                  format="money"
                  variant="hero"
                  subtitle="ناجح — الشهر الحالي (UTC)"
                />
                <StatsMetricCard
                  compact
                  title={`إيرادات ناجحة (${chartFilterPeriodLabelAr})`}
                  value={stats.totalAmount ?? 0}
                  icon={DollarSign}
                  accent="emerald"
                  format="money"
                  subtitle="من التبرعات المدفوعة فقط — حسب الفترة والتصفية"
                />
                <StatsMetricCard
                  compact
                  title="إيرادات ناجحة (كل الوقت)"
                  value={stats.paidRevenueAllTimeUnfiltered ?? 0}
                  icon={DollarSign}
                  accent="emerald"
                  format="money"
                  subtitle="كل تبرعات الرابط الناجحة — دون تصفية الفئة أو المشروع"
                />
                <StatsMetricCard compact title="إيرادات شهرية متكررة" value={stats.monthlyRecurringRevenue ?? 0} icon={Repeat} accent="emerald" format="money" subtitle="اشتراكات نشطة" />
                <StatsMetricCard compact title="دعم الفريق" value={stats.teamSupportTotal ?? 0} icon={HandCoins} accent="amber" format="money" subtitle="من التبرعات الناجحة" />
                {/* <StatsMetricCard compact title="الرسوم" value={stats.feesTotal ?? 0} icon={Percent} accent="orange" format="money" subtitle="من التبرعات الناجحة" /> */}
                <StatsMetricCard compact title="تبرعات ناجحة" value={stats.paidCount ?? 0} icon={Receipt} accent="teal" subtitle={`إجمالي: ${formatMoney(stats.totalAmount ?? 0, undefined, undefined, true)}`} />
                <StatsMetricCard compact title="تبرعات فاشلة" value={stats.failedCount ?? 0} icon={Receipt} accent="orange" subtitle={stats.failedTotalAmount ? formatMoney(stats.failedTotalAmount, undefined, undefined, true) : "—"} />
              </>
            )}
            {statCardSet === "overview" && (
              <>
                <StatsMetricCard
                  compact
                  title={`كل المحاولات (${chartFilterPeriodLabelAr})`}
                  value={stats.totalDonations ?? 0}
                  icon={Receipt}
                  accent="violet"
                  subtitle="ناجح + فاشل + معلق"
                />
                <StatsMetricCard compact title="مرة واحدة (ناجح)" value={stats.oneTimeCount ?? 0} icon={Receipt} accent="slate" />
                <StatsMetricCard compact title="شهرية (ناجح)" value={stats.monthlyCount ?? 0} icon={Repeat} accent="slate" />
              </>
            )}
            {statCardSet === "breakdown" && (
              <>
                <StatsMetricCard compact title="مرة واحدة (عدد)" value={stats.oneTimeAllCount ?? 0} icon={Receipt} accent="slate" subtitle={`ناجح: ${stats.oneTimeCount ?? 0}`} />
                <StatsMetricCard compact title="شهرية (عدد)" value={stats.monthlyAllCount ?? 0} icon={Repeat} accent="slate" subtitle={`ناجح: ${stats.monthlyCount ?? 0}`} />
                <StatsMetricCard compact title="التبرعات الشهرية الناشطة" value={stats.activeMonthlyAmountUSD ?? 0} icon={Repeat} accent="teal" format="money" subtitle={`عدد: ${stats.activeMonthlyCount ?? 0}`} />
                <StatsMetricCard compact title="التبرعات الشهرية المتوقفة" value={stats.monthlyStoppedAmountUSD ?? 0} icon={Repeat} accent="indigo" format="money" subtitle={`عدد: ${stats.monthlyStoppedCount ?? 0}`} />
              </>
            )}
          </div>
        </section>


        {/* التحليلات */}
        <section className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardContent className="pt-6">
              <Tabs defaultValue="time-series" className="w-full" dir="rtl">
                <TabsContent value="time-series" className="mt-0" dir="rtl">
                  <div className="h-[400px] w-full">
                    {chartLoading ? (
                      <div className="h-full flex items-center justify-center bg-slate-50 rounded-lg">
                        <Loader2 className="w-9 h-9 animate-spin text-brand" />
                      </div>
                    ) : chartView === "bar" ? (
                      chartMetric === "amount" ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} barCategoryGap="16%" barGap={6} margin={{ top: 10, right: 24, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                            <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(v) => formatIstanbulDateKeyLabel(v, "en-US", { day: "numeric", month: "short" })} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} domain={[0, "auto"]} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                              labelFormatter={(v) => formatIstanbulDateKeyLabel(String(v), "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                              formatter={(value: number, name: string) => {
                                if (name === "amountOneTime") return [formatMoney(Number(value), undefined, undefined, true), "مبلغ مرة واحدة"];
                                if (name === "amountMonthly") return [formatMoney(Number(value), undefined, undefined, true), "مبلغ شهري"];
                                return [formatMoney(Number(value), undefined, undefined, true), name];
                              }}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const point = chartData.find((d) => d.date === label);
                                return (
                                  <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                                    <p className="text-sm font-medium text-slate-700 mb-1.5">{label ? formatIstanbulDateKeyLabel(String(label), "ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}</p>
                                    {payload.map((entry) => (
                                      <p key={String(entry.name)} className="text-sm text-slate-600" style={{ color: entry.color }}>
                                        {entry.name}: {formatMoney(Number(entry.value), undefined, undefined, true)}
                                      </p>
                                    ))}
                                    {point != null && (
                                      <>
                                        <p className="text-sm font-medium text-slate-700 mt-1.5 pt-1 border-t border-slate-100">الإجمالي: {formatMoney(Number(point.amountUSD ?? 0), undefined, undefined, true)}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">عدد التبرعات: {Math.round(Number(point.count))}</p>
                                      </>
                                    )}
                                  </div>
                                );
                              }}
                            />
                            <Legend />
                            <Bar dataKey="amountOneTime" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} name="مبلغ مرة واحدة" />
                            <Bar dataKey="amountMonthly" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={32} name="مبلغ شهري" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} barCategoryGap="20%" barGap={8}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                            <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(v) => formatIstanbulDateKeyLabel(v, "en-US", { day: "numeric", month: "short" })} interval="preserveStartEnd" />
                            <YAxis yAxisId="amount" orientation="left" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} domain={[0, "auto"]} />
                            <YAxis yAxisId="count" orientation="right" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => String(Math.round(Number(v)))} domain={[0, "auto"]} />
                            <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} labelFormatter={(v) => formatIstanbulDateKeyLabel(String(v), "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} formatter={(value: number, name: string) => [(name === "count" || name === "عدد التبرعات") ? String(Math.round(Number(value))) : formatMoney(Number(value), undefined, undefined, true), chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"]} />
                            <Legend />
                            <Bar yAxisId="amount" dataKey={chartMetric} fill={chartMetric === "teamSupport" ? "#f59e0b" : "#ea580c"} radius={[4, 4, 0, 0]} maxBarSize={36} name={chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"} />
                            <Line yAxisId="count" type="monotone" dataKey="count" stroke="#0f766e" strokeWidth={2} dot={false} name="عدد التبرعات" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )
                    ) : chartView === "line" ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                          <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(v) => formatIstanbulDateKeyLabel(v, "en-US", { day: "numeric", month: "short" })} interval="preserveStartEnd" />
                          <YAxis yAxisId="amount" orientation="right" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} />
                          <YAxis yAxisId="count" orientation="left" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => String(Math.round(Number(v)))} domain={[0, "auto"]} />
                          <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} labelFormatter={(v) => formatIstanbulDateKeyLabel(String(v), "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} formatter={(value: number, name: string) => [(name === "count" || name === "عدد التبرعات") ? String(Math.round(Number(value))) : formatMoney(Number(value), undefined, undefined, true), chartMetric === "amount" ? "المبلغ" : chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"]} />
                          <Legend />
                          <Line yAxisId="amount" type="monotone" dataKey={chartMetric === "amount" ? "amountUSD" : chartMetric} stroke={chartMetric === "amount" ? "#2563eb" : chartMetric === "teamSupport" ? "#f59e0b" : "#ea580c"} strokeWidth={2} dot={false} name={chartMetric === "amount" ? "المبلغ" : chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"} />
                          <Line yAxisId="count" type="monotone" dataKey="count" stroke="#0f766e" strokeWidth={2} dot={false} name="عدد التبرعات" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                          <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(v) => formatIstanbulDateKeyLabel(v, "en-US", { day: "numeric", month: "short" })} interval="preserveStartEnd" />
                          <YAxis yAxisId="amount" orientation="right" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} />
                          <YAxis yAxisId="count" orientation="left" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickFormatter={(v) => String(Math.round(Number(v)))} domain={[0, "auto"]} />
                          <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} labelFormatter={(v) => formatIstanbulDateKeyLabel(String(v), "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} formatter={(value: number, name: string) => [(name === "count" || name === "عدد التبرعات") ? String(Math.round(Number(value))) : formatMoney(Number(value), undefined, undefined, true), chartMetric === "amount" ? "المبلغ" : chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"]} />
                          <Legend />
                          <Area yAxisId="amount" type="monotone" dataKey={chartMetric === "amount" ? "amountUSD" : chartMetric} stroke={chartMetric === "amount" ? "#2563eb" : chartMetric === "teamSupport" ? "#f59e0b" : "#ea580c"} fill={chartMetric === "amount" ? "#93c5fd" : chartMetric === "teamSupport" ? "#fcd34d" : "#fdba74"} fillOpacity={0.4} strokeWidth={2} name={chartMetric === "amount" ? "المبلغ" : chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"} />
                          <Line yAxisId="count" type="monotone" dataKey="count" stroke="#0f766e" strokeWidth={2} dot={false} name="عدد التبرعات" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="split" className="mt-0" dir="rtl">
                  <Tabs defaultValue="one-time-monthly" className="w-full" dir="rtl">
                    <TabsList className="bg-slate-100 p-1 rounded-lg mb-4 inline-flex flex-row-reverse">
                      <TabsTrigger value="campaign-category" className="data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">مشاريع vs فئات</TabsTrigger>
                      <TabsTrigger value="one-time-monthly" className="data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">مرة واحدة vs شهرية</TabsTrigger>
                    </TabsList>
                    <TabsContent value="campaign-category" className="mt-0">
                      <div className="h-[340px] w-full flex items-center justify-center">
                        {revenueSplitData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={revenueSplitData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} dataKey="value" nameKey="name" label={false}>
                                {revenueSplitData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                              </Pie>
                              <Tooltip formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => [`${formatMoney(Number(value), undefined, undefined, true)} — عدد: ${props?.payload?.count ?? 0}`, "المبلغ / العدد"]} />
                              <Legend content={DashboardPieLegendByValue} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500">لا توجد بيانات</p>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="one-time-monthly" className="mt-0" dir="rtl">
                      <div className="h-[340px] w-full flex items-center justify-center">
                        {typeSplitData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={typeSplitData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} dataKey="value" nameKey="name" label={false}>
                                {typeSplitData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                              </Pie>
                              <Tooltip formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => [`${formatMoney(Number(value), undefined, undefined, true)} — عدد: ${props?.payload?.count ?? 0}`, "المبلغ / العدد"]} />
                              <Legend content={DashboardPieLegendByValue} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500">لا توجد بيانات</p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                <TabsList className="bg-slate-100 p-1 rounded-lg mt-6 flex-row-reverse w-full justify-end max-w-max">
                  <TabsTrigger value="split" className="data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
                    <PieChartIcon className="w-4 h-4" />
                    توزيع الإيرادات
                  </TabsTrigger>
                  <TabsTrigger value="time-series" className="data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2">
                    <BarChart3 className="w-4 h-4" />
                    التبرعات عبر الزمن
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        
        {/* تصفية النتائج */}
        <Card className="border-border shadow-sm">
          <CardHeader className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-row-reverse">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2 justify-end">
                <Search className="w-4 h-4 shrink-0" />
                <span>تصفية النتائج</span>
              </CardTitle>
              <DonationsFilterActions
                canEditDonations={canEditDonations}
                canExportReports={canExportReports}
                onCreateDonation={() => donationActions.openCreate()}
                onExportReport={() => setExportOpen(true)}
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4" dir="rtl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <div className="space-y-2 text-right">
                <label className="text-[11px] font-medium text-slate-500">الفترة</label>
                <Select
                  value={chartPeriod === "custom" || (dateFrom && dateTo) ? "custom" : chartPeriod}
                  onValueChange={(v) => {
                    const p = v as ChartPeriod;
                    setChartPeriod(p);
                    if (p === "custom") {
                      const endKey = istanbulTodayKey();
                      const startKey = istanbulAddCalendarDaysKey(endKey, -30);
                      setDateTo(endKey);
                      setDateFrom(startKey);
                    } else {
                      setDateFrom("");
                      setDateTo("");
                    }
                  }}
                >
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="اختر الفترة" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIOD_LABELS) as ChartPeriod[]).map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">{PERIOD_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chartPeriod === "custom" && (
                  <div className="flex gap-2 pt-1 border-slate-100">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-500">من</label>
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full min-w-[120px] h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-500">إلى</label>
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full min-w-[120px] h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">الفئة</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">جميع الفئات</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">المشروع</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="اختر المشروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2 border-b border-slate-100">
                      <Input placeholder="بحث..." value={searchCampaign} onChange={(e) => setSearchCampaign(e.target.value)} className="w-full h-8 text-xs" />
                    </div>
                    <SelectItem value="all" className="text-xs">جميع المشاريع</SelectItem>
                    {campaigns
                      .filter((c) => {
                        const ids = c.categoryIds ?? (c.categoryId ? [c.categoryId] : []);
                        const inCategory = selectedCategory === "all" || ids.includes(selectedCategory);
                        return inCategory && (!searchCampaign || c.title.toLowerCase().includes(searchCampaign.toLowerCase()));
                      })
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.title}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">القيمة</label>
                <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="اختر القيمة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount" className="text-xs">المبلغ</SelectItem>
                    <SelectItem value="teamSupport" className="text-xs">دعم الفريق</SelectItem>
                    <SelectItem value="fees" className="text-xs">الرسوم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">حالة التبرع (الجدول)</label>
                <Select value={donationsStatusFilter} onValueChange={(v) => setDonationsStatusFilter(v as typeof donationsStatusFilter)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">كل الحالات</SelectItem>
                    <SelectItem value="PAID" className="text-xs">ناجح</SelectItem>
                    <SelectItem value="FAILED" className="text-xs">فاشل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">نوع التبرع</label>
                <Select value={donationsTypeFilter} onValueChange={(v) => setDonationsTypeFilter(v as typeof donationsTypeFilter)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">كل الأنواع</SelectItem>
                    <SelectItem value="ONE_TIME" className="text-xs">لمرة واحدة</SelectItem>
                    <SelectItem value="MONTHLY" className="text-xs">شهري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">الدولة</label>
                <Select value={donationCountryFilter} onValueChange={(v) => setDonationCountryFilter(v)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="الدولة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">كل الدول</SelectItem>
                    {countryOptions.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-xs">
                        {getCountryDisplayNameFromCode(c.code, locale || "ar")} ({c.count})
                      </SelectItem>
                    ))}
                    {countryUnsetCount > 0 && (
                      <SelectItem value="__unset" className="text-xs">
                        غير محدد ({countryUnsetCount})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-500">نوع الرسم</label>
                <Select value={chartView} onValueChange={(v) => setChartView(v as ChartViewType)}>
                  <SelectTrigger className="w-full h-9 px-3 text-xs rounded-lg border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar" className="text-xs">أعمدة</SelectItem>
                    <SelectItem value="line" className="text-xs">خط</SelectItem>
                    <SelectItem value="area" className="text-xs">منطقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* التبرعات */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">التبرعات</h2>
          <Card className="border-border shadow-sm">
            <CardHeader className="border-b border-slate-100 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-row-reverse">
                <div className="text-right space-y-1">
                  <CardTitle className="text-base font-semibold text-slate-900">أحدث التبرعات</CardTitle>
                  <p className="text-[11px] text-slate-500 max-w-xl">
                    يعرض الجدول كل المحاولات حسب «حالة التبرع» في التصفية أعلاه، مع الفترة والرابط.
                  </p>
                </div>
                <Select
                  value={`${donationsSortBy}-${donationsSortOrder}`}
                  onValueChange={(v) => {
                    const [by, order] = v.split("-") as ["date" | "amount", "asc" | "desc"];
                    setDonationsSortBy(by);
                    setDonationsSortOrder(order);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[200px] h-9 border-slate-200 bg-slate-50/50" dir="rtl">
                    <SelectValue placeholder="ترتيب" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="date-desc">الأحدث أولاً</SelectItem>
                    <SelectItem value="date-asc">الأقدم أولاً</SelectItem>
                    <SelectItem value="amount-desc">الأعلى مبلغاً</SelectItem>
                    <SelectItem value="amount-asc">الأقل مبلغاً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full text-xs text-right leading-snug">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700">المتبرع</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 min-w-[100px] max-w-[130px]">الدولة</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">التبرع</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700">الحالة</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">دعم الفريق</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700">النوع</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">مصدر التبرع</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 max-w-[110px]">المشروع / الفئة</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donationsLoading && donations.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                        </td>
                      </tr>
                    ) : !donationsFetchedOnce ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">جاري التحميل...</td>
                      </tr>
                    ) : donations.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">لا توجد تبرعات تطابق التصفية</td>
                      </tr>
                    ) : (
                      donations.map((d) => (
                        <tr
                          key={d.id}
                          onContextMenu={(e) => donationActions.onContextMenu(e, d)}
                          className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="py-1.5 px-2">
                            <button
                              type="button"
                              onClick={() => d.donor?.id && openUserProfile(d.donor.id)}
                              className="text-right w-full max-w-[200px] rounded-md -mx-0.5 px-0.5 py-0 hover:bg-slate-100/80 transition-colors cursor-pointer border-0 bg-transparent"
                            >
                              <p className="font-medium text-slate-900">{d.donor?.name || "—"}</p>
                              {d.donor?.email && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{d.donor.email}</p>
                              )}
                            </button>
                          </td>
                          <td className="py-1.5 px-2 align-middle max-w-[130px]">
                            <DonationTableCountryColumn countryCode={d.donorCountryCode} />
                          </td>
                          <td className="py-1.5 px-2 font-medium text-slate-800" dir="ltr">
                            <span dir="ltr">{formatMoney(donationDisplayTotalLocal(d), d.currency, d.amountUSD ?? undefined)}</span>
                          </td>
                          <td className="py-1.5 px-2">
                            {d.status === "FAILED" ? (
                              <button
                                type="button"
                                onClick={() => openDonationDetails("error", d)}
                                className="inline-block px-1.5 py-px rounded-full text-[11px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
                                title="عرض رسالة الخطأ من بوابة الدفع"
                              >
                                فاشل
                              </button>
                            ) : (
                              <span
                                className={cn(
                                  "inline-block px-1.5 py-px rounded-full text-[11px] font-medium",
                                  d.status === "PAID" && (d.paidAt || d.type === "MONTHLY")
                                    ? "bg-green-100 text-green-700"
                                    : "bg-amber-100 text-amber-700"
                                )}
                                title={d.status === "PAID" && !d.paidAt && d.type !== "MONTHLY" ? "تم بدء الدفع ولم يؤكده مزود الدفع بعد — لا يُحتسب في الإيرادات" : undefined}
                              >
                                {d.status === "PAID"
                                  ? (d.paidAt || d.type === "MONTHLY")
                                    ? "ناجح"
                                    : "قيد التأكيد"
                                  : "معلق"}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 font-medium text-slate-800" dir="ltr">
                            {(d.teamSupport ?? 0) > 0 ? <span dir="ltr">{formatMoney(d.teamSupport ?? 0, d.currency, (d.totalAmount && (d.amountUSD != null)) ? ((d.teamSupport ?? 0) / d.totalAmount) * d.amountUSD : undefined)}</span> : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={cn("inline-block px-1.5 py-px rounded-full text-[11px]", d.type === "MONTHLY" ? "bg-brand text-white" : "bg-slate-100 text-slate-600")}>
                              {d.type === "MONTHLY" ? "شهري" : "مرة واحدة"}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 align-middle">
                            <button
                              type="button"
                              onClick={() => openDonationDetails("attribution", d)}
                              className="inline-flex max-w-full text-right rounded-md hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-0 p-0"
                              title="عرض تفاصيل الإسناد الإعلاني"
                            >
                              <DonationSourceBadge
                                attribution={d.attribution}
                                conversionEventsSentAt={d.conversionEventsSentAt}
                                conversionFailedEventsSentAt={d.conversionFailedEventsSentAt}
                                status={d.status}
                              />
                            </button>
                          </td>
                          <td className="py-1.5 px-2 text-slate-600 max-w-[110px]">
                            {d.campaigns?.length > 0 ? (
                              (() => {
                                const first = d.campaigns[0];
                                const more = d.campaigns.length - 1;
                                const fullList = d.campaigns.map((c) => c.title).join(", ");
                                return (
                                  <div className="flex items-center gap-1 max-w-[110px]">
                                    <Link href={`/${locale}/campaign/${first.id}`} target="_blank" rel="noopener noreferrer" title={fullList} className="truncate text-slate-700 hover:text-brand hover:underline">
                                      {first.title}
                                    </Link>
                                    {more > 0 && <span className="shrink-0 text-[10px] text-slate-400" title={fullList}>+{more}</span>}
                                  </div>
                                );
                              })()
                            ) : d.categories?.length > 0 ? (
                              (() => {
                                const first = d.categories[0];
                                const more = d.categories.length - 1;
                                const fullList = "فئة: " + d.categories.map((c) => c.name).join(", ");
                                return (
                                  <div className="flex items-center gap-1 max-w-[110px]">
                                    <Link href={`/${locale}/category/${first.id}`} target="_blank" rel="noopener noreferrer" title={fullList} className="truncate text-slate-700 hover:text-brand hover:underline">
                                      فئة: {first.name}
                                    </Link>
                                    {more > 0 && <span className="shrink-0 text-[10px] text-slate-400" title={fullList}>+{more}</span>}
                                  </div>
                                );
                              })()
                            ) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">
                            <div className="flex flex-col leading-tight">
                              <span>{new Date(d.createdAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "Europe/Istanbul" })}</span>
                              <span className="text-[10px] text-slate-400" dir="ltr">
                                {new Date(d.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/Istanbul" })}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {hasMoreDonations && (
                <div className="p-4 border-t border-slate-100 text-center">
                  <button type="button" onClick={loadMoreDonations} disabled={donationsLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50">
                    {donationsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
                    عرض المزيد
                  </button>
                </div>
              )}
              {donationsTotal > 0 && (
                <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100 text-right">عرض {donations.length} من {donationsTotal} تبرع</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
      <DonationDetailsDialog
        open={donationDetails.open}
        onOpenChange={(o) => setDonationDetails((s) => ({ ...s, open: o }))}
        mode={donationDetails.mode}
        donation={donationDetails.donation}
      />
      {donationActions.portals}
      {id && (
        <ExportReportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          endpoint={`/api/admin/referrals/${id}/export`}
          title={`تصدير تقرير الإحالة${stats?.referral?.code ? ` — ${stats.referral.code}` : ""}`}
          description="يشمل التقرير كل التبرعات والاشتراكات المرتبطة بهذه الإحالة، مع ملخص شامل وتفصيل لكل حملة."
          defaults={(() => {
            const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
            return {
              ...EXPORT_DEFAULTS,
              period: chartPeriod === "all" ? "all" : "custom",
              start: start ?? "",
              end: end ?? "",
              categoryId: selectedCategory,
              campaignId: selectedCampaign,
              status: donationsStatusFilter,
              type: donationsTypeFilter,
              country: donationCountryFilter,
              sortBy: donationsSortBy,
              sortOrder: donationsSortOrder,
            };
          })()}
          options={{
            categories: categories.map((c) => ({ value: c.id, label: c.name })),
            campaigns: campaigns.map((c) => ({ value: c.id, label: c.title })),
            countries: countryOptions.map((c) => ({ value: c.code, label: c.code })),
            locales: [
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
              { value: "tr", label: "Türkçe" },
              { value: "fr", label: "Français" },
              { value: "id", label: "Bahasa" },
              { value: "pt", label: "Português" },
              { value: "es", label: "Español" },
              { value: "de", label: "Deutsch" },
            ],
          }}
          enabledFields={{
            period: true,
            dateRange: true,
            category: true,
            campaign: true,
            status: true,
            type: true,
            locale: true,
            country: true,
            subscriptionOnly: true,
            sort: true,
            limit: true,
          }}
        />
      )}
    </div>
  );
}
