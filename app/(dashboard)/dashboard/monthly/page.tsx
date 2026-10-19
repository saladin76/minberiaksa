"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  Heart,
  Repeat,
  Calendar,
  Receipt,
  BarChart3,
  PieChart as PieChartIcon,
  Search,
  ChevronDown,
  Loader2,
  HandCoins,
  Percent,
  LayoutList,
  RefreshCw,
  Star,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MetricSummaryBand } from "@/components/dashboard/MetricSummaryBand";
import { CHART_THEME } from "@/lib/dashboard/chart-theme";
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
import axios from "axios";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  createFormatDashboardMoney,
  donationDisplayTotalLocal,
} from "@/lib/dashboard/format-dashboard-money";
import { formatIstanbulCalendarMonthLong } from "@/lib/admin/current-calendar-month-utc";
import {
  DayOfMonthRevenueGrid,
  type DayOfMonthPoint,
  type UnplacedPlans,
} from "@/components/dashboard/DayOfMonthRevenueGrid";
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
import { DonorSearchInput } from "@/components/dashboard/DonorSearchInput";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { DashboardPieLegendByValue } from "@/components/dashboard/DashboardPieLegend";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import DonationDetailsDialog, { type DonationDetailsTarget } from "@/components/dashboard/DonationDetailsDialog";
import { DonationGatewayBadge } from "@/components/dashboard/DonationGatewayBadge";
import { useDonationActions } from "@/components/dashboard/donations/useDonationActions";
import { userCanEditDonations, userCanExportReports } from "@/lib/dashboard/permissions";
import { useSession } from "next-auth/react";
import { ExportReportDialog, EXPORT_DEFAULTS, type ExportFormState } from "@/components/dashboard/ExportReportDialog";
import { dashDir, dashIntl, dt, dtx } from "@/lib/dashboard/i18n";

interface ChartDataPoint {
  date: string;
  amountUSD: number;
  count: number;
  amountOneTime: number;
  countOneTime: number;
  /** All recurring charges (historical name  predates daily / Friday plans). */
  amountMonthly: number;
  countMonthly: number;
  amountDaily?: number;
  countDaily?: number;
  amountFriday?: number;
  countFriday?: number;
  /** Charges from monthly plans only. */
  amountMonthlyPlan?: number;
  countMonthlyPlan?: number;
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

interface UserOption {
  id: string;
  name: string | null;
  email: string;
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
  /** Cadence of the plan behind the charge. */
  frequency?: RecurringFrequency | null;
  /** true when this row is an automatic renewal rather than the signup charge */
  isRecurringCharge?: boolean;
  /** 1-based position within its subscription (1 = signup charge) */
  subscriptionCycle?: number | null;
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
  referral: { id: string; code: string; name?: string | null } | null;
}

interface SubscriptionRow {
  id: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED";
  amount: number;
  amountUSD: number | null;
  /** Per-charge USD on a monthly scale (daily ×30.44, Friday ×4.35). */
  monthlyEquivalentUSD?: number | null;
  currency: string;
  createdAt: string;
  /** DAILY | FRIDAY | MONTHLY  legacy plans come back as MONTHLY. */
  frequency?: RecurringFrequency | null;
  nextBillingDate: string | null;
  lastBillingDate: string | null;
  donor: { id: string; name: string | null; email: string | null };
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
  referral: { id: string; code: string } | null;
}

type RecurringFrequency = "DAILY" | "FRIDAY" | "MONTHLY";
type FrequencyFilter = "all" | RecurringFrequency;

const FREQUENCIES: RecurringFrequency[] = ["DAILY", "FRIDAY", "MONTHLY"];
const FREQUENCY_LABEL_AR: Record<string, string> = { get DAILY() { return dt("يومي"); }, get FRIDAY() { return dt("أسبوعياً"); }, get MONTHLY() { return dt("شهري"); } };
/** One hue per cadence, reused by the cards, the stacked chart and the table badges. */
const FREQUENCY_COLOR: Record<RecurringFrequency, string> = {
  DAILY: "#2c8b5d",
  FRIDAY: "#d39a27",
  MONTHLY: "#234a60",
};
const FREQUENCY_BADGE_CLASS: Record<RecurringFrequency, string> = {
  DAILY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FRIDAY: "bg-amber-50 text-amber-800 border-amber-200",
  MONTHLY: "bg-sky-50 text-sky-800 border-sky-200",
};
/** How the frequency splits the per-charge amount into a monthly figure  shown in notes. */
const FREQUENCY_SCALE_NOTE: Record<RecurringFrequency, string> = {
  get DAILY() { return dt("× ٣٠٫٤ دفعة شهريًا"); },
  get FRIDAY() { return dt("× ٤٫٣٥ دفعة شهريًا"); },
  get MONTHLY() { return dt("دفعة واحدة شهريًا"); },
};

function FrequencyBadge({ frequency }: { frequency?: RecurringFrequency | null }) {
  const f = frequency ?? "MONTHLY";
  return (
    <span className={cn("inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold", FREQUENCY_BADGE_CLASS[f])}>
      {FREQUENCY_LABEL_AR[f]}
    </span>
  );
}

type FrequencyBreakdownRow = {
  activeCount: number;
  activeAmountPerChargeUSD: number;
  activeMonthlyUSD: number;
  pausedCount: number;
  cancelledCount: number;
  paymentFailedCount: number;
  paidCount: number;
  paidAmountUSD: number;
};

type SubscriptionStatusFilter = "ACTIVE" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED" | "all";

interface DashboardStats {
  totalCampaigns: number;
  totalCategories: number;
  totalDonations: number;
  totalUsers: number;
  totalAmount: number;
  allTimeRevenue?: number;
  /** All PAID subscription charges (USD) ever  ignores category/campaign/referral filters */
  paidRevenueAllTimeUnfiltered?: number;
  oneTimeCount: number;
  monthlyCount: number;
  activeMonthlyCount: number;
  monthlyStoppedCount?: number;
  activeMonthlyAmountUSD?: number;
  monthlyStoppedAmountUSD?: number;
  monthlyRecurringRevenue: number;
  thisMonthRevenue: number;
  oneTimeTotalAmount?: number;
  monthlyTotalAmount?: number;
  newSubscriptionsInPeriod?: number;
  totalSubscriptionsMatching?: number;
  pausedSubscriptionCount?: number;
  cancelledSubscriptionCount?: number;
  pausedSubscriptionAmountUSD?: number;
  cancelledSubscriptionAmountUSD?: number;
  paymentFailedSubscriptionCount?: number;
  paymentFailedSubscriptionAmountUSD?: number;
  byFrequency?: Record<RecurringFrequency, FrequencyBreakdownRow>;
  campaignDonationsTotal: number;
  categoryDonationsTotal: number;
  campaignDonationsCount?: number;
  categoryDonationsCount?: number;
  teamSupportTotal?: number;
  feesTotal?: number;
  paidCount?: number;
  failedCount?: number;
  failedTotalAmount?: number;
  recentDonations: Array<{
    id: string;
    amount: number;
    currency: string;
    donorName: string;
    type: string;
    status?: string;
    provider?: string | null;
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
  get day() { return dt("اليوم"); },
  get yesterday() { return dt("أمس"); },
  get week() { return dt("أسبوع"); },
  get month() { return dt("شهر"); },
  get year() { return dt("سنة"); },
  get all() { return dt("كل الوقت"); },
  get custom() { return dt("مخصص"); },
};

// See lib/dashboard/chart-theme.ts  this block was duplicated verbatim from page.tsx.
const CHART_COLORS = {
  primary: CHART_THEME.primary,
  primaryLight: CHART_THEME.primaryLight,
  secondary: CHART_THEME.primaryDark,
  grid: CHART_THEME.grid,
  text: CHART_THEME.text,
};

const PAGE_SIZE = 10;

/** Returns { start, end } in YYYY-MM-DD for the donations API; null = no filter (all time) */
function getDonationsDateRange(
  period: ChartPeriod,
  dateFrom: string,
  dateTo: string
): { start: string | null; end: string | null } {
  return getPeriodDateKeys(period, dateFrom, dateTo);
}

export default function MonthlySubscriptionsDashboardPage() {
  const locale = useLocale() as string;
  const thisMonthRevenueTitle = dt("إيرادات شهر {0}", [formatIstanbulCalendarMonthLong(new Date(), locale || "ar")]);
  const searchParams = useSearchParams();
  const { convertToCurrency, getSelectedCurrency } = useCurrency();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersSearchInput, setUsersSearchInput] = useState("");
  const [usersSearchCommitted, setUsersSearchCommitted] = useState("");
  const [usersSearchLoading, setUsersSearchLoading] = useState(false);
  const [statCardSet, setStatCardSet] = useState<StatCardSet>("revenue");

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  /** Plan cadence  narrows every card, chart and table on the page. */
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("all");

  // Sync user filter from URL (e.g. from users page "تحليل تبرعات")
  useEffect(() => {
    const uid = searchParams.get("userId");
    if (uid && uid !== "all") {
      setSelectedUserId(uid);
      fetch(`/api/users/${uid}`)
        .then((r) => r.json())
        .then((data) => {
          const u = data?.user;
          if (u)
            setUsers((prev) => {
              if (prev.some((x) => x.id === u.id)) return prev;
              return [{ id: u.id, name: u.name ?? null, email: u.email ?? "" }, ...prev];
            });
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<{
    collected: DayOfMonthPoint[];
    expected: DayOfMonthPoint[];
    unplaced: UnplacedPlans[];
  }>({
    collected: [],
    expected: [],
    unplaced: [],
  });
  const [dayOfMonthLoading, setDayOfMonthLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartView, setChartView] = useState<ChartViewType>("bar");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("amount");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [donationsSortBy, setDonationsSortBy] = useState<"date" | "amount">("date");
  const [donationsSortOrder, setDonationsSortOrder] = useState<"asc" | "desc">("desc");
  const [donationsStatusFilter, setDonationsStatusFilter] = useState<"all" | "PAID" | "PENDING" | "FAILED">("all");
  /** Applied donor search (name or email) for أحدث الدفعات المتكررة  server-side. */
  const [donationsSearch, setDonationsSearch] = useState("");
  /** Applied donor search (name or email) for قائمة الاشتراكات  server-side, independent of the table above. */
  const [subsSearch, setSubsSearch] = useState("");
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

  // Export dialog state  opens a popup with every filter from this page plus
  // a CSV/Excel toggle. Defaults are seeded from the live page filters so the
  // export reflects what the user is currently looking at.
  const [exportOpen, setExportOpen] = useState(false);

  const [subStatusFilter, setSubStatusFilter] = useState<SubscriptionStatusFilter>("ACTIVE");
  const [subsRows, setSubsRows] = useState<SubscriptionRow[]>([]);
  const [subsPage, setSubsPage] = useState(1);
  const [subsTotal, setSubsTotal] = useState(0);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsFetchedOnce, setSubsFetchedOnce] = useState(false);
  const [subsSortBy, setSubsSortBy] = useState<"date" | "amount">("date");
  const [subsSortOrder, setSubsSortOrder] = useState<"asc" | "desc">("desc");
  const [subsStatusUpdatingId, setSubsStatusUpdatingId] = useState<string | null>(null);
  const [reducePlan, setReducePlan] = useState<SubscriptionRow | null>(null);
  const [reduceAmount, setReduceAmount] = useState("");
  const [reduceMethod, setReduceMethod] = useState<"PHONE" | "EMAIL" | "WHATSAPP" | "SIGNED">("PHONE");
  const [reduceEvidence, setReduceEvidence] = useState("");
  const [reduceBusy, setReduceBusy] = useState(false);
  const [providerChecks, setProviderChecks] = useState<
    Record<string, { loading: boolean; result?: { rail: string; providerStatus: string | null; providerPaused: boolean | null; inSync: boolean; error?: string } }>
  >({});
  const checkProviderState = useCallback(async (subscriptionId: string) => {
    setProviderChecks((prev) => ({ ...prev, [subscriptionId]: { loading: true } }));
    try {
      const res = await axios.get(`/api/admin/subscriptions/${subscriptionId}/provider-state`);
      setProviderChecks((prev) => ({ ...prev, [subscriptionId]: { loading: false, result: res.data } }));
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data as { error?: string })?.error || e.message : dt("خطأ");
      setProviderChecks((prev) => ({
        ...prev,
        [subscriptionId]: { loading: false, result: { rail: "STRIPE", providerStatus: null, providerPaused: null, inSync: false, error: msg } },
      }));
    }
  }, []);

  // Fetch categories and campaigns
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const lc = locale || "ar";
        const [categoriesRes, campaignsRes] = await Promise.all([
          fetch(`/api/categories?locale=${lc}&counts=true&limit=200`),
          fetch(`/api/campaigns/all?locale=${lc}&isActiveFalse=true`),
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
  }, [locale]);

  // Fetch distinct donor countries for the country filter dropdown
  const fetchCountries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/donations/countries");
      if (!res.ok) return;
      const data = await res.json();
      setCountryOptions(Array.isArray(data?.countries) ? data.countries : []);
      setCountryUnsetCount(Number(data?.unsetCount) || 0);
    } catch (error) {
      console.error("Error fetching donor countries:", error);
    }
  }, []);

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  const commitUsersSearch = useCallback(() => {
    setUsersSearchCommitted(usersSearchInput.trim());
  }, [usersSearchInput]);

  useEffect(() => {
    if (!usersSearchCommitted) return;
    const controller = new AbortController();
    setUsersSearchLoading(true);
    const run = async () => {
      try {
        const res = await fetch(
          `/api/users?search=${encodeURIComponent(usersSearchCommitted)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok) {
          toast.error(typeof data?.error === "string" ? data.error : dt("فشل البحث عن المستخدمين"));
          setUsers([]);
          return;
        }
        setUsers(data.users ?? []);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setUsers([]);
      } finally {
        setUsersSearchLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [usersSearchCommitted]);

  useEffect(() => {
    if (usersSearchCommitted) return;
    if (selectedUserId === "all") {
      setUsers([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${selectedUserId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const u = data?.user;
        if (u)
          setUsers([{ id: u.id, name: u.name ?? null, email: u.email ?? "" }]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [usersSearchCommitted, selectedUserId]);

  // Chart data (filters + period + from/to + user  user from state or URL when coming via link)
  const fetchChartData = useCallback(async () => {
    const userIdFromUrl = searchParams.get("userId");
    const effectiveUserId = selectedUserId !== "all" ? selectedUserId : (userIdFromUrl && userIdFromUrl !== "all" ? userIdFromUrl : "all");
    setChartLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("period", chartPeriod);
      const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
      if (start && end) {
        params.set("start", start);
        params.set("end", end);
      }
      if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
      if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
      if (effectiveUserId !== "all") params.append("userId", effectiveUserId);
      if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
      const response = await axios.get(`/api/admin/subscriptions/overview/chart?${params}`);
      setChartData(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      toast.error(dt("فشل في تحميل بيانات التبرعات المتكررة"));
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [selectedCategory, selectedCampaign, selectedUserId, searchParams, chartPeriod, dateFrom, dateTo, frequencyFilter]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // Day-of-month recurring revenue. Deliberately NOT scoped to a period: a subscription bills on
  // the same calendar day every month, so the useful view aggregates across all months to expose
  // the billing rhythm. It still honours the category/campaign/donor filters.
  const fetchDayOfMonth = useCallback(async () => {
    const userIdFromUrl = searchParams.get("userId");
    const effectiveUserId =
      selectedUserId !== "all"
        ? selectedUserId
        : userIdFromUrl && userIdFromUrl !== "all"
          ? userIdFromUrl
          : "all";
    setDayOfMonthLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
      if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
      if (effectiveUserId !== "all") params.append("userId", effectiveUserId);
      if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
      const response = await axios.get(`/api/admin/subscriptions/overview/day-of-month?${params}`);
      setDayOfMonth({
        collected: Array.isArray(response.data?.collected) ? response.data.collected : [],
        expected: Array.isArray(response.data?.expected) ? response.data.expected : [],
        unplaced: Array.isArray(response.data?.unplaced) ? response.data.unplaced : [],
      });
    } catch {
      setDayOfMonth({ collected: [], expected: [], unplaced: [] });
    } finally {
      setDayOfMonthLoading(false);
    }
  }, [selectedCategory, selectedCampaign, selectedUserId, searchParams, frequencyFilter]);

  useEffect(() => {
    fetchDayOfMonth();
  }, [fetchDayOfMonth]);

  // Same filters fetchDayOfMonth sends, handed to the grid so its per-day drill-down
  // queries the identical population the cells were computed from.
  const dayOfMonthFilters = useMemo(() => {
    const userIdFromUrl = searchParams.get("userId");
    const effectiveUserId =
      selectedUserId !== "all"
        ? selectedUserId
        : userIdFromUrl && userIdFromUrl !== "all"
          ? userIdFromUrl
          : "all";
    return {
      categoryId: selectedCategory,
      campaignId: selectedCampaign,
      userId: effectiveUserId,
      frequency: frequencyFilter,
    };
  }, [selectedCategory, selectedCampaign, selectedUserId, searchParams, frequencyFilter]);

  // Stats  affected by فترة (period + dateFrom/dateTo) and category/campaign filters
  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("period", chartPeriod);
      const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
      if (start && end) {
        params.set("start", start);
        params.set("end", end);
      }
      if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
      if (selectedCampaign !== "all") params.set("campaignId", selectedCampaign);
      if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
      const response = await fetch(`/api/admin/subscriptions/overview/stats?${params}`);
      const data = await response.json();
      if (!response.ok) {
        const message = data?.details || data?.error || dt("فشل في تحميل إحصائيات الاشتراكات");
        toast.error(message);
        return;
      }
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error(dt("فشل في تحميل إحصائيات الاشتراكات"));
    } finally {
      setLoading(false);
    }
  }, [chartPeriod, dateFrom, dateTo, selectedCategory, selectedCampaign, frequencyFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Donations list  uses تصفية النتائج + chart time span (period + from/to) + sort
  const fetchDonations = useCallback(
    async (page: number, append: boolean) => {
      setDonationsLoading(true);
      try {
        const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        params.set("sortBy", donationsSortBy);
        params.set("sortOrder", donationsSortOrder);
        if (selectedCategory !== "all") params.append("categoryId", selectedCategory);
        if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
        if (selectedUserId !== "all") params.append("userId", selectedUserId);
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        params.set("subscriptionOnly", "1");
        if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
        if (donationsStatusFilter !== "all") params.set("status", donationsStatusFilter);
        if (donationCountryFilter !== "all") params.set("country", donationCountryFilter);
        if (donationsSearch) params.set("search", donationsSearch);
        const res = await fetch(`/api/donations?${params}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || dt("فشل في تحميل الدفعات المتكررة"));
          return;
        }
        const list = Array.isArray(data.donations) ? data.donations : [];
        setDonations((prev) => (append ? [...prev, ...list] : list));
        setDonationsTotal(data.pagination?.total ?? 0);
      } catch (error) {
        console.error("Error fetching donations:", error);
        toast.error(dt("فشل في تحميل الدفعات المتكررة"));
      } finally {
        setDonationsLoading(false);
        setDonationsFetchedOnce(true);
      }
    },
    [
      selectedCategory,
      selectedCampaign,
      selectedUserId,
      chartPeriod,
      dateFrom,
      dateTo,
      donationsSortBy,
      donationsSortOrder,
      donationsStatusFilter,
      donationCountryFilter,
      donationsSearch,
      frequencyFilter,
    ]
  );

  // Fetch donations when filters or time span or sort change
  useEffect(() => {
    if (loading) return;
    setDonationsPage(1);
    fetchDonations(1, false);
  }, [loading, selectedCategory, selectedCampaign, selectedUserId, chartPeriod, dateFrom, dateTo, donationsSortBy, donationsSortOrder, donationsStatusFilter, donationCountryFilter, donationsSearch, frequencyFilter, fetchDonations]);

  const fetchSubscriptions = useCallback(
    async (page: number, append: boolean) => {
      setSubsLoading(true);
      try {
        const userIdFromUrl = searchParams.get("userId");
        const effectiveUserId =
          selectedUserId !== "all"
            ? selectedUserId
            : userIdFromUrl && userIdFromUrl !== "all"
              ? userIdFromUrl
              : "all";
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        params.set("sortBy", subsSortBy);
        params.set("sortOrder", subsSortOrder);
        params.set("status", subStatusFilter === "all" ? "ALL" : subStatusFilter);
        if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
        if (selectedCampaign !== "all") params.set("campaignId", selectedCampaign);
        if (effectiveUserId !== "all") params.set("userId", effectiveUserId);
        if (subsSearch) params.set("search", subsSearch);
        if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
        const res = await fetch(`/api/admin/subscriptions?${params}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || dt("فشل في تحميل الاشتراكات"));
          return;
        }
        const list = Array.isArray(data.subscriptions) ? data.subscriptions : [];
        setSubsRows((prev) => (append ? [...prev, ...list] : list));
        setSubsTotal(data.pagination?.total ?? 0);
      } catch {
        toast.error(dt("فشل في تحميل الاشتراكات"));
      } finally {
        setSubsLoading(false);
        setSubsFetchedOnce(true);
      }
    },
    [
      searchParams,
      selectedUserId,
      selectedCategory,
      selectedCampaign,
      subStatusFilter,
      subsSortBy,
      subsSortOrder,
      subsSearch,
      frequencyFilter,
    ]
  );

  const submitSubscriptionReduction = useCallback(async () => {
    if (!reducePlan || reduceBusy) return;
    const amount = Number(reduceAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount >= reducePlan.amount || reduceEvidence.trim().length < 12) {
      toast.error(dt("أدخل مبلغًا أقل، مع إثبات موافقة المتبرع (12 حرفًا على الأقل)"));
      return;
    }
    setReduceBusy(true);
    try {
      const res = await axios.patch(`/api/admin/subscriptions/${reducePlan.id}`, {
        amount, consentMethod: reduceMethod, consentEvidence: reduceEvidence.trim(),
      });
      if (!res.data?.ok) throw new Error("Reduction not confirmed");
      toast.success(dt("تم تخفيض المبلغ ابتداءً من الدورة القادمة وتوثيق موافقة المتبرع"));
      setReducePlan(null);
      setReduceEvidence("");
      setReduceAmount("");
      setSubsPage(1);
      await fetchSubscriptions(1, false);
      void fetchStats();
    } catch (error) {
      toast.error(axios.isAxiosError(error) ? (error.response?.data?.error ?? dt("تعذّر التخفيض")) : dt("تعذّر التخفيض"));
    } finally {
      setReduceBusy(false);
    }
  }, [reducePlan, reduceBusy, reduceAmount, reduceMethod, reduceEvidence, fetchSubscriptions, fetchStats]);

  const handleSubscriptionStatusChange = useCallback(
    async (
      subscriptionId: string,
      newStatus: SubscriptionRow["status"],
      previousStatus: SubscriptionRow["status"]
    ) => {
      if (newStatus === previousStatus) return;
      setSubsStatusUpdatingId(subscriptionId);
      try {
        const res = await axios.patch(`/api/admin/subscriptions/${subscriptionId}`, { status: newStatus });
        const rail = (res.data as { provider?: { rail?: string } })?.provider?.rail;
        setProviderChecks((prev) => {
          const next = { ...prev };
          delete next[subscriptionId];
          return next;
        });
        toast.success(
          rail === "STRIPE"
            ? dt("تم تحديث حالة الاشتراك وتأكيدها في Stripe")
            : dt("تم تحديث حالة الاشتراك")
        );
        setSubsPage(1);
        await fetchSubscriptions(1, false);
      } catch (e: unknown) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data as { error?: string })?.error || e.message
          : dt("فشل تحديث حالة الاشتراك");
        toast.error(typeof msg === "string" ? msg : dt("فشل تحديث حالة الاشتراك"));
      } finally {
        setSubsStatusUpdatingId(null);
      }
    },
    [fetchSubscriptions]
  );

  useEffect(() => {
    if (loading) return;
    setSubsPage(1);
    fetchSubscriptions(1, false);
  }, [
    loading,
    selectedCategory,
    selectedCampaign,
    selectedUserId,
    searchParams,
    subStatusFilter,
    subsSortBy,
    subsSortOrder,
    subsSearch,
    frequencyFilter,
    fetchSubscriptions,
  ]);

  const loadMoreSubs = () => {
    const next = subsPage + 1;
    setSubsPage(next);
    fetchSubscriptions(next, true);
  };

  const hasMoreSubs = subsRows.length < subsTotal && !subsLoading;

  const loadMoreDonations = () => {
    const next = donationsPage + 1;
    setDonationsPage(next);
    fetchDonations(next, true);
  };

  const hasMoreDonations =
    donations.length < donationsTotal && !donationsLoading;

  // Right-click edit/delete on donation rows (gated on donationsEdit perm).
  const { data: sessionForActions } = useSession();
  const canEditDonations = userCanEditDonations(sessionForActions?.user);
  const canExportReports = userCanExportReports(sessionForActions?.user);
  const refreshAfterDonationMutation = useCallback(() => {
    setDonationsPage(1);
    setSubsPage(1);
    void Promise.all([
      fetchDonations(1, false),
      fetchSubscriptions(1, false),
      fetchStats(),
      fetchChartData(),
      fetchDayOfMonth(),
      fetchCountries(),
    ]);
  }, [fetchDonations, fetchSubscriptions, fetchStats, fetchChartData, fetchDayOfMonth, fetchCountries]);
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

  if (loading) {
    return <LoadingSkeleton />;
  }

  const revenueSplitData = [
    {
      name: dt("مشاريع"),
      value: stats?.campaignDonationsTotal ?? 0,
      count: stats?.campaignDonationsCount ?? 0,
      color: "#295a75",
    },
    {
      name: dt("فئات"),
      value: stats?.categoryDonationsTotal ?? 0,
      count: stats?.categoryDonationsCount ?? 0,
      color: "#6e818b",
    },
  ].filter((d) => d.value > 0 || d.count > 0);

  const statusSplitData = [
    {
      name: dt("نشطة"),
      value: stats?.activeMonthlyAmountUSD ?? 0,
      count: stats?.activeMonthlyCount ?? 0,
      color: "#2c8b5d",
    },
    {
      name: dt("موقوفة"),
      value: stats?.pausedSubscriptionAmountUSD ?? 0,
      count: stats?.pausedSubscriptionCount ?? 0,
      color: "#d39a27",
    },
    {
      name: dt("ملغاة"),
      value: stats?.cancelledSubscriptionAmountUSD ?? 0,
      count: stats?.cancelledSubscriptionCount ?? 0,
      color: "#6e818b",
    },
    {
      name: dt("تعذّر الخصم"),
      value: stats?.paymentFailedSubscriptionAmountUSD ?? 0,
      count: stats?.paymentFailedSubscriptionCount ?? 0,
      color: "#b04a2c",
    },
  ].filter((d) => d.value > 0 || d.count > 0);

  // Cadence split of active plans  money is the monthly equivalent so the slices add up to MRR.
  const frequencySplitData = FREQUENCIES.map((f) => ({
    name: FREQUENCY_LABEL_AR[f],
    value: stats?.byFrequency?.[f]?.activeMonthlyUSD ?? 0,
    count: stats?.byFrequency?.[f]?.activeCount ?? 0,
    color: FREQUENCY_COLOR[f],
  })).filter((d) => d.value > 0 || d.count > 0);
  const frequencyLabelSuffix = frequencyFilter === "all" ? "" : `  ${FREQUENCY_LABEL_AR[frequencyFilter]}`;

  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="space-y-6 sm:space-y-8 p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title={dt("التبرعات المتكررة والاشتراكات")}
          icon={Repeat}
          description={
            searchParams.get("userId") ? (
              <>
                {dt("عرض الدفعات المتكررة للمستخدم: ")}
                <span className="font-medium text-slate-900 whitespace-normal break-words">
                  {users.find((u) => u.id === searchParams.get("userId"))?.name ||
                    users.find((u) => u.id === searchParams.get("userId"))?.email ||
                    dt("جاري التحميل...")}
                </span>
              </>
            ) : (
              dt("كل التبرعات المتكررة  اليومية، وأسبوعياً، والشهرية: الإيرادات، دفعات التجديد، والحالة")
            )
          }
        />

        {/* Cadence switch  narrows every figure, chart and table below to one kind of plan. */}
        <div className="flex flex-wrap items-center gap-2" dir={dashDir()}>
          <span className="text-xs font-semibold text-slate-500">{dt("الدورية:")}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="tablist">
            {(["all", ...FREQUENCIES] as FrequencyFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={frequencyFilter === f}
                onClick={() => setFrequencyFilter(f)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  frequencyFilter === f ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {f !== "all" && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: frequencyFilter === f ? "#fff" : FREQUENCY_COLOR[f] }}
                    aria-hidden="true"
                  />
                )}
                {f === "all" ? dt("الكل") : FREQUENCY_LABEL_AR[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Executive hero band  mirrors /dashboard. This page opened with 17 equal-weight KPI
            tiles spread across three tabs and no headline figure at all, so there was nothing
            to anchor on. MRR is the number this page exists to report. */}
        {!searchParams.get("userId") && (
          <div className="grid gap-4 lg:grid-cols-2">
            <MetricSummaryBand
              icon={Repeat}
              eyebrow={dt("الإيراد الشهري المتكرر (MRR){0}", [frequencyLabelSuffix])}
              badge={dt("شهريًا")}
              value={formatMoney(Math.round(stats?.monthlyRecurringRevenue ?? 0))}
              note={dt("المكافئ الشهري للاشتراكات النشطة: اليومي × ٣٠٫٤، وأسبوعياً × ٤٫٣٥، والشهري كما هو.")}
            />
            {/* ARR is MRR×12  a projection of the current book, not money collected. The note
                says so, because a figure this size sitting beside real revenue invites being
                read as cash in hand. */}
            <MetricSummaryBand
              icon={TrendingUp}
              eyebrow={dt("الإيراد السنوي المتكرر (ARR){0}", [frequencyLabelSuffix])}
              badge={dt("سنويًا")}
              value={formatMoney(Math.round((stats?.monthlyRecurringRevenue ?? 0) * 12))}
              note={dt("توقّع سنوي = الإيراد الشهري المتكرر × ١٢، بافتراض استمرار الاشتراكات النشطة الحالية. ليس مبلغًا محصّلًا.")}
            />
          </div>
        )}

        {/* Per-cadence cards. Each is a filter shortcut too  clicking one narrows the page. */}
        {!searchParams.get("userId") && stats?.byFrequency && (
          <section className="grid gap-3 sm:grid-cols-3" dir={dashDir()}>
            {FREQUENCIES.map((f) => {
              const row = stats.byFrequency![f];
              const mrr = stats.byFrequency
                ? FREQUENCIES.reduce((s, k) => s + (stats.byFrequency![k]?.activeMonthlyUSD ?? 0), 0)
                : 0;
              const share = mrr > 0 ? Math.round(((row?.activeMonthlyUSD ?? 0) / mrr) * 100) : 0;
              const selected = frequencyFilter === f;
              const dimmed = frequencyFilter !== "all" && !selected;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequencyFilter(selected ? "all" : f)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-start shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-md",
                    selected ? "border-brand ring-2 ring-brand/20" : "border-slate-200",
                    dimmed && "opacity-60"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FREQUENCY_COLOR[f] }} aria-hidden="true" />
                      {f === "DAILY" ? dt("التبرعات اليومية") : f === "FRIDAY" ? dt("تبرعات أسبوعياً") : dt("التبرعات الشهرية")}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                      {dtx("{0} نشط", [row?.activeCount ?? 0])}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{dt("المكافئ الشهري")}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">
                    {formatMoney(Math.round(row?.activeMonthlyUSD ?? 0))}
                  </p>
                  {frequencyFilter === "all" && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: FREQUENCY_COLOR[f] }} />
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <div>
                      <p>{dt("قيمة الدفعات")}</p>
                      <p className="font-semibold tabular-nums text-slate-800">
                        {formatMoney(row?.activeAmountPerChargeUSD ?? 0, undefined, undefined, true)}
                        <span className="font-normal text-slate-400"> {FREQUENCY_SCALE_NOTE[f]}</span>
                      </p>
                    </div>
                    <div>
                      <p>{dtx("محصّل ({0})", [chartFilterPeriodLabelAr])}</p>
                      <p className="font-semibold tabular-nums text-slate-800">
                        {formatMoney(row?.paidAmountUSD ?? 0, undefined, undefined, true)}
                        <span className="font-normal text-slate-400"> {dtx(" · {0} دفعة", [row?.paidCount ?? 0])}</span>
                      </p>
                    </div>
                  </div>
                  {((row?.pausedCount ?? 0) + (row?.cancelledCount ?? 0) + (row?.paymentFailedCount ?? 0)) > 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      {dtx("موقوف {0} · ملغى {1}", [row?.pausedCount ?? 0, row?.cancelledCount ?? 0])}
                      {(row?.paymentFailedCount ?? 0) > 0 ? dt(" · تعذّر الخصم {0}", [row?.paymentFailedCount]) : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </section>
        )}

        {/* المؤشرات  تختفي عند عرض تبرعات مستخدم معين عبر الرابط */}
        {!searchParams.get("userId") && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
                <Repeat className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold leading-tight text-slate-900">{dt("مؤشرات الاشتراكات والدفعات")}</h2>
                <p className="text-xs text-slate-500">{dt("محسوبة حسب الفترة والتصفية المختارة")}</p>
              </div>
            </div>
            <Tabs
              value={statCardSet}
              onValueChange={(v) => setStatCardSet(v as StatCardSet)}
              className="w-auto"
            >
              <TabsList className="bg-muted p-1 rounded-lg h-9" dir={dashDir()}>
                <TabsTrigger
                  value="revenue"
                  className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"
                >
                  {dt("الإيرادات")}</TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"
                >
                  {dt("نظرة عامة")}</TabsTrigger>
                <TabsTrigger
                  value="breakdown"
                  className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm"
                >
                  {dt("تفصيل الاشتراكات")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {statCardSet === "revenue" && (
              <>
                <StatsMetricCard
                  compact
                  title={thisMonthRevenueTitle}
                  value={stats?.thisMonthRevenue ?? 0}
                  icon={Calendar}
                  accent="emerald"
                  format="money"
                  variant="hero"
                  subtitle={dt("دفعات ناجحة في الشهر الحالي (UTC)")}
                />
                <StatsMetricCard
                  compact
                  title={dt("إيرادات ناجحة ({0})", [chartFilterPeriodLabelAr])}
                  bankTransfers={false}
                  value={stats?.totalAmount ?? 0}
                  icon={DollarSign}
                  accent="emerald"
                  format="money"
                  subtitle={dt("دفعات الاشتراك المدفوعة فقط  حسب الفترة والتصفية أعلاه")}
                />
                <StatsMetricCard
                  compact
                  title={dt("إيرادات ناجحة (كل الوقت)")}
                  value={stats?.paidRevenueAllTimeUnfiltered ?? 0}
                  icon={DollarSign}
                  accent="emerald"
                  format="money"
                  subtitle={dt("كل دفعات الاشتراك الناجحة  دون تصفية الفئة أو المشروع أو الفترة")}
                />
                <StatsMetricCard
                  compact
                  title={dt("إيرادات شهرية متكررة (MRR)")}
                  value={stats?.monthlyRecurringRevenue ?? 0}
                  icon={Repeat}
                  accent="emerald"
                  format="money"
                  subtitle={dt("اشتراكات نشطة  المكافئ الشهري لكل الدوريات")}
                />
                <StatsMetricCard
                  compact
                  title={dt("دعم الفريق")}
                  value={stats?.teamSupportTotal ?? 0}
                  icon={HandCoins}
                  accent="amber"
                  format="money"
                  subtitle={dt("من الدفعات الناجحة ({0})", [chartFilterPeriodLabelAr])}
                />
                <StatsMetricCard
                  compact
                  title={dt("الرسوم")}
                  value={stats?.feesTotal ?? 0}
                  icon={Percent}
                  accent="orange"
                  format="money"
                  subtitle={dt("من الدفعات الناجحة ({0})", [chartFilterPeriodLabelAr])}
                />
                <StatsMetricCard
                  compact
                  title={dt("دفعات ناجحة")}
                  value={stats?.paidCount ?? 0}
                  icon={Receipt}
                  accent="teal"
                  subtitle={dt("إجمالي ناجح: {0}", [formatMoney(stats?.totalAmount ?? 0, undefined, undefined, true)])}
                />
                <StatsMetricCard
                  compact
                  title={dt("دفعات فاشلة")}
                  value={stats?.failedCount ?? 0}
                  icon={Receipt}
                  accent="orange"
                  subtitle={stats?.failedTotalAmount ? formatMoney(stats.failedTotalAmount, undefined, undefined, true) : "—"}
                />
              </>
            )}
            {statCardSet === "overview" && (
              <>
                <StatsMetricCard
                  compact
                  title={dt("إجمالي الاشتراكات (بالتصفية)")}
                  value={stats?.totalSubscriptionsMatching ?? 0}
                  icon={Repeat}
                  accent="teal"
                />
                <StatsMetricCard
                  compact
                  title={dt("جديدة ({0})", [chartFilterPeriodLabelAr])}
                  value={stats?.newSubscriptionsInPeriod ?? 0}
                  icon={Calendar}
                  accent="indigo"
                />
                <StatsMetricCard
                  compact
                  title={dt("دفعات متكررة ({0})", [chartFilterPeriodLabelAr])}
                  value={stats?.totalDonations ?? 0}
                  icon={Receipt}
                  accent="violet"
                />
                <StatsMetricCard
                  compact
                  title={dt("اشتراكات نشطة")}
                  value={stats?.activeMonthlyCount ?? 0}
                  icon={Heart}
                  accent="emerald"
                />
              </>
            )}
            {statCardSet === "breakdown" && (
              <>
                <StatsMetricCard
                  compact
                  title={dt("اشتراكات نشطة (عدد)")}
                  value={stats?.activeMonthlyCount ?? 0}
                  icon={Repeat}
                  accent="teal"
                />
                <StatsMetricCard
                  compact
                  title={dt("موقوفة (عدد)")}
                  value={stats?.pausedSubscriptionCount ?? 0}
                  icon={Receipt}
                  accent="amber"
                />
                <StatsMetricCard
                  compact
                  title={dt("ملغاة (عدد)")}
                  value={stats?.cancelledSubscriptionCount ?? 0}
                  icon={Receipt}
                  accent="slate"
                />
                <StatsMetricCard
                  compact
                  title={dt("مبلغ اشتراكات نشطة")}
                  value={stats?.activeMonthlyAmountUSD ?? 0}
                  icon={Repeat}
                  accent="emerald"
                  format="money"
                  subtitle={dt("مكافئ شهري")}
                />
                <StatsMetricCard
                  compact
                  title={dt("مجموع موقوف + ملغى")}
                  value={stats?.monthlyStoppedAmountUSD ?? 0}
                  icon={Repeat}
                  accent="indigo"
                  format="money"
                  subtitle={dt("مكافئ شهري · موقوف: {0} · ملغى: {1}", [stats?.pausedSubscriptionCount ?? 0, stats?.cancelledSubscriptionCount ?? 0])}
                />
                <StatsMetricCard
                  compact
                  title={dt("تعذّر الخصم (عدد)")}
                  value={stats?.paymentFailedSubscriptionCount ?? 0}
                  icon={Receipt}
                  accent="orange"
                  subtitle={dt("استنفدت محاولات الخصم التلقائي  تحتاج تحديث البطاقة")}
                />
              </>
            )}
          </div>
        </section>
        )}

        {/* التحليلات */}
        <section className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardContent className="pt-6">
              <Tabs defaultValue="time-series" className="w-full" dir={dashDir()}>


                <TabsContent value="time-series" className="mt-0" dir={dashDir()}>
                  <div className="h-[400px] w-full">
                    {chartLoading ? (
                      <div className="h-full flex items-center justify-center bg-slate-50 rounded-lg">
                        <Loader2 className="w-9 h-9 animate-spin text-brand" />
                      </div>
                    ) : chartView === "bar" ? (
                      chartMetric === "amount" ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={chartData}
                            barCategoryGap="16%"
                            barGap={6}
                            margin={{ top: 10, right: 24, left: 10, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                              tickFormatter={(v) =>
                                formatIstanbulDateKeyLabel(v, "en-US", {
                                  day: "numeric",
                                  month: "short",
                                })
                              }
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                              tickFormatter={(v) => formatMoney(Number(v))}
                              domain={[0, "auto"]}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#fff",
                                border: "1px solid #dde4e8",
                                borderRadius: "8px",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              labelFormatter={(v) =>
                                formatIstanbulDateKeyLabel(v, "en-US", {
                                  weekday: "long",
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              }
                              formatter={(value: number, name: string) => [formatMoney(Number(value), undefined, undefined, true), name]}
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const point = chartData.find((d) => d.date === label);
                                const isAmount = (key: string) => key.startsWith("amount");
                                return (
                                  <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                                    <p className="text-sm font-medium text-slate-700 mb-1.5">
                                      {label ? formatIstanbulDateKeyLabel(String(label), dashIntl("ar-EG"), { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}
                                    </p>
                                    {payload.map((entry) => {
                                      const dataKey = (entry as { dataKey?: string }).dataKey ?? entry.name;
                                      const showAsMoney = isAmount(String(dataKey)) || isAmount(String(entry.name));
                                      return (
                                        <p key={String(entry.name)} className="text-sm text-slate-600" style={{ color: entry.color }}>
                                          {entry.name}: {showAsMoney ? formatMoney(Number(entry.value), undefined, undefined, true) : String(entry.value)}
                                        </p>
                                      );
                                    })}
                                    {point != null && (
                                      <>
                                        <p className="text-sm font-medium text-slate-700 mt-1.5 pt-1 border-t border-slate-100">
                                          {dtx("الإجمالي: {0}", [formatMoney(Number(point.amountUSD ?? 0), undefined, undefined, true)])}
                                        </p>
                                        <p className="text-sm text-slate-500 mt-0.5">
                                          {dtx("عدد الدفعات: {0}", [Math.round(Number(point.count))])}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                );
                              }}
                            />
                            <Legend />
                            {/* One stack per cadence; filtered to one cadence it is a single bar. */}
                            {FREQUENCIES.filter((f) => frequencyFilter === "all" || frequencyFilter === f).map((f, i, shown) => (
                              <Bar
                                key={f}
                                stackId="cadence"
                                dataKey={f === "DAILY" ? "amountDaily" : f === "FRIDAY" ? "amountFriday" : "amountMonthlyPlan"}
                                fill={FREQUENCY_COLOR[f]}
                                radius={i === shown.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                maxBarSize={36}
                                name={FREQUENCY_LABEL_AR[f]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={chartData}
                            barCategoryGap="20%"
                            barGap={8}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                              tickFormatter={(v) =>
                                formatIstanbulDateKeyLabel(v, "en-US", {
                                  day: "numeric",
                                  month: "short",
                                })
                              }
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              yAxisId="amount"
                              orientation="left"
                              tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                              tickFormatter={(v) => formatMoney(Number(v))}
                              domain={[0, "auto"]}
                            />
                            <YAxis
                              yAxisId="count"
                              orientation="right"
                              tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                              tickFormatter={(v) => String(Math.round(Number(v)))}
                              domain={[0, "auto"]}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#fff",
                                border: "1px solid #dde4e8",
                                borderRadius: "8px",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              labelFormatter={(v) =>
                                formatIstanbulDateKeyLabel(v, "en-US", {
                                  weekday: "long",
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              }
                              formatter={(value: number, name: string) => {
                                if (name === "count" || name === "عدد التبرعات") return [String(Math.round(Number(value))), "عدد التبرعات"];
                                if (chartMetric === "teamSupport") return [formatMoney(Number(value), undefined, undefined, true), dt("دعم الفريق")];
                                if (chartMetric === "fees") return [formatMoney(Number(value), undefined, undefined, true), dt("الرسوم")];
                                return [String(Math.round(Number(value))), dt("العدد")];
                              }}
                            />
                            <Legend />
                            <Bar
                              yAxisId="amount"
                              dataKey={chartMetric}
                              fill={chartMetric === "teamSupport" ? "#d39a27" : "#b04a2c"}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={36}
                              name={chartMetric === "teamSupport" ? "دعم الفريق" : "الرسوم"}
                            />
                            <Line
                              yAxisId="count"
                              type="monotone"
                              dataKey="count"
                              stroke="#1a6340"
                              strokeWidth={2}
                              dot={false}
                              name="عدد التبرعات"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )
                    ) : chartView === "line" ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_COLORS.grid}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                            tickFormatter={(v) =>
                              formatIstanbulDateKeyLabel(v, "en-US", {
                                day: "numeric",
                                month: "short",
                              })
                            }
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            yAxisId="amount"
                            orientation="right"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            tickFormatter={(v) => formatMoney(Number(v))}
                          />
                          <YAxis
                            yAxisId="count"
                            orientation="left"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            tickFormatter={(v) => String(Math.round(Number(v)))}
                            domain={[0, "auto"]}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #dde4e8",
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            }}
                            labelFormatter={(v) =>
                              formatIstanbulDateKeyLabel(v, "en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            }
                            formatter={(value: number, name: string) => {
                              if (name === "count" || name === "عدد التبرعات") return [String(Math.round(Number(value))), "عدد التبرعات"];
                              if (chartMetric === "amount") return [formatMoney(Number(value), undefined, undefined, true), dt("المبلغ")];
                              if (chartMetric === "teamSupport") return [formatMoney(Number(value), undefined, undefined, true), dt("دعم الفريق")];
                              if (chartMetric === "fees") return [formatMoney(Number(value), undefined, undefined, true), dt("الرسوم")];
                              return [String(Math.round(Number(value))), dt("العدد")];
                            }}
                          />
                          <Legend />
                          <Line
                            yAxisId="amount"
                            type="monotone"
                            dataKey={chartMetric === "amount" ? "amountUSD" : chartMetric}
                            stroke={
                              chartMetric === "amount"
                                ? "#295a75"
                                : chartMetric === "teamSupport"
                                  ? "#d39a27"
                                  : "#b04a2c"
                            }
                            strokeWidth={2}
                            dot={false}
                            name={
                              chartMetric === "amount"
                                ? "المبلغ"
                                : chartMetric === "teamSupport"
                                  ? "دعم الفريق"
                                  : "الرسوم"
                            }
                          />
                          <Line
                            yAxisId="count"
                            type="monotone"
                            dataKey="count"
                            stroke="#1a6340"
                            strokeWidth={2}
                            dot={false}
                            name="عدد التبرعات"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_COLORS.grid}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                            tickFormatter={(v) =>
                              formatIstanbulDateKeyLabel(v, "en-US", {
                                day: "numeric",
                                month: "short",
                              })
                            }
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            yAxisId="amount"
                            orientation="right"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            tickFormatter={(v) => formatMoney(Number(v))}
                          />
                          <YAxis
                            yAxisId="count"
                            orientation="left"
                            tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                            tickFormatter={(v) => String(Math.round(Number(v)))}
                            domain={[0, "auto"]}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#fff",
                              border: "1px solid #dde4e8",
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                            }}
                            labelFormatter={(v) =>
                              formatIstanbulDateKeyLabel(v, "en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            }
                            formatter={(value: number, name: string) => {
                              if (name === "count" || name === "عدد التبرعات") return [String(Math.round(Number(value))), "عدد التبرعات"];
                              if (chartMetric === "amount") return [formatMoney(Number(value), undefined, undefined, true), dt("المبلغ")];
                              if (chartMetric === "teamSupport") return [formatMoney(Number(value), undefined, undefined, true), dt("دعم الفريق")];
                              if (chartMetric === "fees") return [formatMoney(Number(value), undefined, undefined, true), dt("الرسوم")];
                              return [String(Math.round(Number(value))), dt("العدد")];
                            }}
                          />
                          <Legend />
                          <Area
                            yAxisId="amount"
                            type="monotone"
                            dataKey={chartMetric === "amount" ? "amountUSD" : chartMetric}
                            stroke={
                              chartMetric === "amount"
                                ? "#295a75"
                                : chartMetric === "teamSupport"
                                  ? "#d39a27"
                                  : "#b04a2c"
                            }
                            fill={
                              chartMetric === "amount"
                                ? "#83b2c9"
                                : chartMetric === "teamSupport"
                                  ? "#ecc977"
                                  : "#e8a783"
                            }
                            fillOpacity={0.4}
                            strokeWidth={2}
                            name={
                              chartMetric === "amount"
                                ? "المبلغ"
                                : chartMetric === "teamSupport"
                                  ? "دعم الفريق"
                                  : "الرسوم"
                            }
                          />
                          <Line
                            yAxisId="count"
                            type="monotone"
                            dataKey="count"
                            stroke="#1a6340"
                            strokeWidth={2}
                            dot={false}
                            name="عدد التبرعات"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="split" className="mt-0" dir={dashDir()}>
                  <Tabs defaultValue="frequency" className="w-full" dir={dashDir()}>
                    <TabsList className="bg-slate-100 p-1 rounded-lg mb-4 inline-flex flex-row-reverse">
                      <TabsTrigger
                        value="frequency"
                        className="data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm"
                      >
                        {dt("حسب الدورية")}</TabsTrigger>
                      <TabsTrigger
                        value="campaign-category"
                        className="data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm"
                      >
                        {dt("مشاريع vs فئات")}</TabsTrigger>
                      <TabsTrigger
                        value="subscription-status"
                        className="data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm"
                      >
                        {dt("حالة الاشتراك")}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="frequency" className="mt-0" dir={dashDir()}>
                      <div className="h-[340px] w-full flex items-center justify-center">
                        {frequencySplitData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={frequencySplitData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={110}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={false}
                              >
                                {frequencySplitData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [
                                    dt("{0} شهريًا  {1} اشتراك نشط", [formatMoney(Number(value), undefined, undefined, true), count]),
                                    dt("المكافئ الشهري / العدد"),
                                  ];
                                }}
                              />
                              <Legend content={DashboardPieLegendByValue} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500">{dt("لا توجد بيانات")}</p>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="campaign-category" className="mt-0">
                      <div className="h-[340px] w-full flex items-center justify-center">
                        {revenueSplitData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={revenueSplitData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={110}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={false}
                              >
                                {revenueSplitData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [
                                    dt("{0}  عدد: {1}", [formatMoney(Number(value), undefined, undefined, true), count]),
                                    dt("المبلغ / العدد"),
                                  ];
                                }}
                              />
                              <Legend content={DashboardPieLegendByValue} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500">{dt("لا توجد بيانات")}</p>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="subscription-status" className="mt-0" dir={dashDir()}>
                      <div className="h-[340px] w-full flex items-center justify-center">
                        {statusSplitData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={statusSplitData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={110}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={false}
                              >
                                {statusSplitData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [
                                    dt("{0}  عدد: {1}", [formatMoney(Number(value), undefined, undefined, true), count]),
                                    dt("المبلغ / العدد"),
                                  ];
                                }}
                              />
                              <Legend content={DashboardPieLegendByValue} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500">{dt("لا توجد بيانات")}</p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                <TabsList className="bg-slate-100 p-1 rounded-lg mt-6 flex-row-reverse w-full justify-end max-w-max">
                  <TabsTrigger
                    value="split"
                    className="data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2"
                  >
                    <PieChartIcon className="w-4 h-4" />
                    {dt("توزيع الإيرادات")}</TabsTrigger>
                  <TabsTrigger
                    value="time-series"
                    className="data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2"
                  >
                    <BarChart3 className="w-4 h-4" />
                    {dt("الدفعات المتكررة عبر الزمن")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
        </section>

                {/* تصفية النتائج  تؤثر على الرسم وجدول التبرعات (فترة، فئة، مشروع، مستخدم، نوع الرسم) */}
                <Card className="border-border shadow-sm">
          <CardHeader className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-row-reverse">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2 justify-end">
                <Search className="w-4 h-4 shrink-0" />
                <span>{dt("تصفية النتائج")}</span>
              </CardTitle>
              <DonationsFilterActions
                canEditDonations={canEditDonations}
                canExportReports={canExportReports}
                onCreateDonation={() => donationActions.openCreate()}
                onExportReport={() => setExportOpen(true)}
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4" dir={dashDir()}>

<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">

    {/* Period  مع من/إلى/مسح تحته عند مخصص */}
    <div className="space-y-2 text-start">
      <label className="text-[11px] font-semibold text-slate-600">
        {dt("الفترة")}</label>
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
        <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
          <SelectValue placeholder={dt("اختر الفترة")} />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as ChartPeriod[]).map((p) => (
            <SelectItem key={p} value={p} className="text-xs">
              {PERIOD_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chartPeriod === "custom" && (
        <div className="flex gap-2 pt-1 border-slate-100">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">{dt("من")}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full min-w-[132px] h-10 px-3 text-[13px] rounded-lg border border-slate-200 bg-white text-slate-800 transition-colors hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">{dt("إلى")}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full min-w-[132px] h-10 px-3 text-[13px] rounded-lg border border-slate-200 bg-white text-slate-800 transition-colors hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
        </div>
      )}
    </div>

  {/* Category */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("الفئة")}</label>
    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("اختر الفئة")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">{dt("جميع الفئات")}</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id} className="text-xs">
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {/* Campaign */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("المشروع")}</label>
    <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("اختر المشروع")} />
      </SelectTrigger>
      <SelectContent>
        <div className="p-2 border-b border-slate-100">
          <Input
            placeholder={dt("بحث...")}
            value={searchCampaign}
            onChange={(e) => setSearchCampaign(e.target.value)}
            className="w-full h-8 text-xs"
          />
        </div>
        <SelectItem value="all" className="text-xs">{dt("جميع المشاريع")}</SelectItem>
        {campaigns
          .filter((c) => {
            const ids = c.categoryIds ?? (c.categoryId ? [c.categoryId] : []);
            const inCategory = selectedCategory === "all" || ids.includes(selectedCategory);
            return inCategory && (!searchCampaign ||
              c.title.toLowerCase().includes(searchCampaign.toLowerCase()));
          })
          .map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.title}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  </div>

  {/* User  hidden when viewing a specific user via link (?userId=...) */}
  {!searchParams.get("userId") && (
    <div className="space-y-1 text-start">
      <label className="text-[11px] font-semibold text-slate-600">
        {dt("المستخدم")}</label>
      <Select
        value={selectedUserId}
        onValueChange={(v) => {
          setSelectedUserId(v);
          if (v === "all") {
            setUsersSearchInput("");
            setUsersSearchCommitted("");
            setUsers([]);
          }
        }}
      >
        <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
          <SelectValue placeholder={dt("اختر المستخدم")} />
        </SelectTrigger>
        <SelectContent>
          <div className="p-2 border-b border-slate-100 flex gap-1.5 flex-row-reverse items-center">
            <Input
              placeholder={dt("بحث… ثم Enter أو زر البحث")}
              value={usersSearchInput}
              onChange={(e) => setUsersSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitUsersSearch();
                }
              }}
              className="w-full h-8 text-xs flex-1 min-w-0"
            />
            <button
              type="button"
              title={dt("بحث")}
              disabled={usersSearchLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                commitUsersSearch();
              }}
              className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
            >
              {usersSearchLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
              ) : (
                <Search className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
          <SelectItem value="all" className="text-xs">{dt("الكل")}</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id} className="text-xs">
              {u.name || u.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )}

  {/* Chart Metric */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("القيمة")}</label>
    <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("اختر القيمة")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="amount" className="text-xs">{dt("المبلغ")}</SelectItem>
        <SelectItem value="teamSupport" className="text-xs">{dt("دعم الفريق")}</SelectItem>
        <SelectItem value="fees" className="text-xs">{dt("الرسوم")}</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Chart Type */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("نوع الرسم")}</label>
    <Select value={chartView} onValueChange={(v) => setChartView(v as ChartViewType)}>
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("اختر النوع")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="bar" className="text-xs">{dt("أعمدة")}</SelectItem>
        <SelectItem value="line" className="text-xs">{dt("خط")}</SelectItem>
        <SelectItem value="area" className="text-xs">{dt("منطقة")}</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Donor country (الدفعات فقط) */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("الدولة (الدفعات)")}</label>
    <Select
      value={donationCountryFilter}
      onValueChange={(v) => setDonationCountryFilter(v)}
    >
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("الدولة")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">{dt("كل الدول")}</SelectItem>
        {countryOptions.map((c) => (
          <SelectItem key={c.code} value={c.code} className="text-xs">
            {getCountryDisplayNameFromCode(c.code, locale || "ar")} ({c.count})
          </SelectItem>
        ))}
        {countryUnsetCount > 0 && (
          <SelectItem value="__unset" className="text-xs">
            {dtx("غير محدد ({0})", [countryUnsetCount])}</SelectItem>
        )}
      </SelectContent>
    </Select>
  </div>

  {/* Donation Status Filter */}
  <div className="space-y-1 text-start">
    <label className="text-[11px] font-semibold text-slate-600">
      {dt("حالة الدفعة")}</label>
    <Select value={donationsStatusFilter} onValueChange={(v) => setDonationsStatusFilter(v as typeof donationsStatusFilter)}>
      <SelectTrigger className="w-full h-10 px-3 text-[13px] rounded-lg border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15">
        <SelectValue placeholder={dt("الحالة")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">{dt("كل الحالات")}</SelectItem>
        <SelectItem value="PAID" className="text-xs">{dt("ناجح")}</SelectItem>
        <SelectItem value="PENDING" className="text-xs">{dt("قيد التأكيد")}</SelectItem>
        <SelectItem value="FAILED" className="text-xs">{dt("فاشل")}</SelectItem>
      </SelectContent>
    </Select>
  </div>

</div>

</CardContent>



        </Card>

        {/* الدفعات المتكررة */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-start">
            {dtx("الدفعات المتكررة{0}", [frequencyLabelSuffix])}
          </h2>
          <Card className="border-border shadow-sm">
            <CardHeader className="border-b border-slate-100 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-row-reverse">
                <div className="text-start space-y-1">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    {dt("أحدث الدفعات المتكررة")}</CardTitle>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
                <DonorSearchInput
                  value={donationsSearch}
                  onCommit={setDonationsSearch}
                  loading={donationsLoading}
                />
                <Select
                  value={`${donationsSortBy}-${donationsSortOrder}`}
                  onValueChange={(v) => {
                    const [by, order] = v.split("-") as ["date" | "amount", "asc" | "desc"];
                    setDonationsSortBy(by);
                    setDonationsSortOrder(order);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[200px] h-9 border-slate-200 bg-slate-50/50" dir={dashDir()}>
                    <SelectValue placeholder={dt("ترتيب")} />
                  </SelectTrigger>
                  <SelectContent dir={dashDir()}>
                    <SelectItem value="date-desc">{dt("الأحدث أولاً")}</SelectItem>
                    <SelectItem value="date-asc">{dt("الأقدم أولاً")}</SelectItem>
                    <SelectItem value="amount-desc">{dt("الأعلى مبلغاً")}</SelectItem>
                    <SelectItem value="amount-asc">{dt("الأقل مبلغاً")}</SelectItem>
                  </SelectContent>
                </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto" dir={dashDir()}>
                <table className="w-full text-xs text-start leading-snug">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {dt("المتبرع")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 min-w-[100px] max-w-[130px]">
                        {dt("الدولة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {dt("التبرع")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {dt("نوع الدفعة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {dt("الحالة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {dt("البوابة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {dt("دعم الفريق")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {dt("الإحالة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {dt("مصدر التبرع")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 max-w-[110px]">
                        {dt("المشروع / الفئة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {dt("التاريخ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donationsLoading && donations.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                        </td>
                      </tr>
                    ) : !donationsFetchedOnce ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-500">
                          {dt("جاري التحميل...")}</td>
                      </tr>
                    ) : donations.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-500">
                          {dt("لا توجد تبرعات تطابق التصفية")}</td>
                      </tr>
                    ) : (
                      donations.map((d) => (
                        <tr
                          key={d.id}
                          onContextMenu={(e) => donationActions.onContextMenu(e, d)}
                          className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => d.donor?.id && openUserProfile(d.donor.id)}
                              className="text-start w-full max-w-[200px] rounded-md -mx-0.5 px-0.5 py-0 hover:bg-slate-100/80 transition-colors cursor-pointer border-0 bg-transparent"
                            >
                              <p className="font-medium text-slate-900">
                                {d.donor?.name || "—"}
                              </p>
                              {d.donor?.email && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[160px]">
                                  {d.donor.email}
                                </p>
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 align-middle max-w-[130px]">
                            <DonationTableCountryColumn countryCode={d.donorCountryCode} />
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800" dir={dashDir()}>
                            <span dir="ltr">
                              {formatMoney(donationDisplayTotalLocal(d), d.currency, d.amountUSD ?? undefined)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {d.type === "MONTHLY" && (
                              <div className="mb-1">
                                <FrequencyBadge frequency={d.frequency} />
                              </div>
                            )}
                            {d.type === "MONTHLY" ? (
                              d.isRecurringCharge ? (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-medium bg-brand/10 text-brand"
                                  title={dt("خصم تلقائي متكرر  تم دون أي إجراء من المتبرع")}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  {dtx("تجديد تلقائي{0}", [d.subscriptionCycle ? ` #${d.subscriptionCycle}` : ""])}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-medium bg-green-100 text-green-700"
                                  title={dt("أول دفعة عند إنشاء الاشتراك")}
                                >
                                  <HandCoins className="w-3 h-3" />
                                  {dt("أول دفعة")}</span>
                              )
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {d.status === "FAILED" ? (
                              <button
                                type="button"
                                onClick={() => openDonationDetails("error", d)}
                                className="inline-block px-1.5 py-px rounded-full text-[11px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
                                title={dt("عرض رسالة الخطأ من بوابة الدفع")}
                              >
                                {dt("فاشل")}</button>
                            ) : (
                              <span
                                className={cn("inline-block px-1.5 py-px rounded-full text-[11px] font-medium", d.status === "PAID" && d.paidAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}
                                title={d.status === "PAID" && !d.paidAt ? dt("تم بدء الدفع ولم يؤكده مزود الدفع بعد  لا يُحتسب في الإيرادات") : undefined}
                              >
                                {d.status === "PAID" ? (d.paidAt ? dt("ناجح") : dt("قيد التأكيد")) : dt("معلق")}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <DonationGatewayBadge donation={d} onOpen={() => openDonationDetails("payment", d)} />
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800" dir={dashDir()}>
                            {(d.teamSupport ?? 0) > 0 ? (
                              <span dir="ltr">
                                {formatMoney(d.teamSupport ?? 0, d.currency, (d.totalAmount && (d.amountUSD != null)) ? ((d.teamSupport ?? 0) / d.totalAmount) * d.amountUSD : undefined)}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            {d.referral ? (
                              <Link
                                href={`/dashboard/referrals/${d.referral.id}`}
                                className="text-xs font-medium text-brand hover:text-brand hover:underline"
                              >
                                {d.referral.code}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            <button
                              type="button"
                              onClick={() => openDonationDetails("attribution", d)}
                              className="inline-flex max-w-full text-start rounded-md hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-0 p-0"
                              title={dt("عرض تفاصيل الإسناد الإعلاني")}
                            >
                              <DonationSourceBadge
                                attribution={d.attribution}
                                conversionEventsSentAt={d.conversionEventsSentAt}
                                conversionFailedEventsSentAt={d.conversionFailedEventsSentAt}
                                status={d.status}
                              />
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-[110px]">
                            {d.campaigns?.length > 0 ? (
                              (() => {
                                const first = d.campaigns[0];
                                const more = d.campaigns.length - 1;
                                const fullList = d.campaigns.map((c) => c.title).join(", ");
                                return (
                                  <div className="flex items-center gap-1 max-w-[110px]">
                                    <Link
                                      href={`/${locale}/campaign/${first.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={fullList}
                                      className="truncate text-slate-700 hover:text-brand hover:underline"
                                    >
                                      {first.title}
                                    </Link>
                                    {more > 0 && (
                                      <span className="shrink-0 text-[10px] text-slate-400" title={fullList}>
                                        +{more}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()
                            ) : d.categories?.length > 0 ? (
                              (() => {
                                const first = d.categories[0];
                                const more = d.categories.length - 1;
                                const fullList = dt("فئة: {0}", [d.categories.map((c) => c.name).join(", ")]);
                                return (
                                  <div className="flex items-center gap-1 max-w-[110px]">
                                    <Link
                                      href={`/${locale}/category/${first.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={fullList}
                                      className="truncate text-slate-700 hover:text-brand hover:underline"
                                    >
                                      {dtx("فئة: {0}", [first.name])}
                                    </Link>
                                    {more > 0 && (
                                      <span className="shrink-0 text-[10px] text-slate-400" title={fullList}>
                                        +{more}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            <div className="flex flex-col leading-tight">
                              <span>
                                {new Date(d.createdAt).toLocaleDateString("en-US", {
                                  dateStyle: "medium",
                                  timeZone: "Europe/Istanbul",
                                })}
                              </span>
                              <span className="text-[10px] text-slate-400" dir="ltr">
                                {new Date(d.createdAt).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                  timeZone: "Europe/Istanbul",
                                })}
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
                  <button
                    type="button"
                    onClick={loadMoreDonations}
                    disabled={donationsLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
                  >
                    {donationsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4 rotate-180" />
                    )}
                    {dt("عرض المزيد")}</button>
                </div>
              )}
              {donationsTotal > 0 && (
                <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100 text-start">
                  {dtx("عرض {0} من {1} تبرع", [donations.length, donationsTotal])}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recurring money by day-of-month, aggregated across every month rather than within one.
            Sits under the payments table because it answers the question that table raises:
            these renewals land on a fixed calendar day, so which days is the money arriving on. */}
        <DayOfMonthRevenueGrid
          collected={dayOfMonth.collected}
          expected={dayOfMonth.expected}
          loading={dayOfMonthLoading}
          formatMoney={formatMoney}
          filters={dayOfMonthFilters}
          unplaced={dayOfMonth.unplaced}
        />

      {reducePlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 space-y-4 text-start" dir={dashDir()} role="dialog" aria-modal="true" aria-labelledby="reduce-sub-title">
            <h3 id="reduce-sub-title" className="text-lg font-bold">{dt("تخفيض مبلغ التبرع الدوري")}</h3>
            <p className="text-sm text-slate-600">{dtx("المبلغ الحالي: {0} {1}. يبدأ المبلغ الجديد من دورة التجديد التالية، ولا يتم خصم مبلغ الآن.", [reducePlan.amount, reducePlan.currency])}</p>
            <label className="block text-sm font-medium">{dtx("المبلغ الجديد ({0})", [reducePlan.currency])}<Input type="number" step="0.01" min="1" max={Math.max(1, reducePlan.amount - 0.01)} value={reduceAmount} onChange={e => setReduceAmount(e.target.value)} dir="ltr" />
            </label>
            <label className="block text-sm font-medium">{dt("طريقة توثيق موافقة المتبرع")}<Select value={reduceMethod} onValueChange={v => setReduceMethod(v as typeof reduceMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir={dashDir()}>
                  <SelectItem value="PHONE">{dt("مكالمة هاتفية")}</SelectItem>
                  <SelectItem value="EMAIL">{dt("بريد إلكتروني")}</SelectItem>
                  <SelectItem value="WHATSAPP">{dt("واتساب")}</SelectItem>
                  <SelectItem value="SIGNED">{dt("موافقة مكتوبة موقعة")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm font-medium">{dt("مرجع الموافقة وتاريخها")}<textarea className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-24" maxLength={2000} value={reduceEvidence} onChange={e => setReduceEvidence(e.target.value)} placeholder={dt("التاريخ، وصف الموافقة، ورقم المحادثة أو مرجع المستند")} />
            </label>
            <p className="text-xs text-slate-500">{dt("لا يمكن تغيير مبلغ اشتراك يقترب موعد خصمه خلال 24 ساعة أو يخضع لمحاولة تحصيل جارية. الإلغاء يظل متاحًا عبر إدارة المؤسسة.")}</p>
            <div className="flex gap-2">
              <button type="button" className="bg-brand text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50" disabled={reduceBusy} onClick={() => void submitSubscriptionReduction()}>{reduceBusy ? dt("جارٍ الحفظ…") : dt("تأكيد التخفيض")}</button>
              <button type="button" className="bg-gray-100 rounded-lg px-4 py-2 text-sm" disabled={reduceBusy} onClick={() => setReducePlan(null)}>{dt("إغلاق")}</button>
            </div>
          </div>
        </div>
      )}

        {/* الاشتراكات  الجدول السفلي */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-start">
            {dt("الاشتراكات")}</h2>
          <Card className="border border-gray-200/60 shadow-md shadow-violet-500/5 overflow-hidden bg-card">
            <CardHeader className="border-b border-brand/20 py-4 bg-brand/4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between flex-row-reverse">
                <div className="flex items-center gap-3 justify-end min-w-0">
                  <div className="p-2 rounded-xl bg-brand text-white shadow-sm shrink-0">
                    <LayoutList className="w-5 h-5" />
                  </div>
                  <div className="text-start min-w-0">
                    <CardTitle className="text-base font-semibold text-slate-900">
                      {dt("قائمة الاشتراكات")}</CardTitle>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-row-reverse shrink-0 flex-wrap">
                  <div className="space-y-1 text-start w-full sm:w-auto">
                    <label className="text-[11px] font-semibold text-slate-600">{dt("بحث")}</label>
                    <DonorSearchInput
                      value={subsSearch}
                      onCommit={setSubsSearch}
                      loading={subsLoading}
                      className="sm:w-[240px]"
                    />
                  </div>
                  <div className="space-y-1 text-start w-full sm:w-auto sm:min-w-[200px]">
                    <label className="text-[11px] font-semibold text-slate-600">{dt("المشترك")}</label>
                    <Select
                      value={selectedUserId}
                      onValueChange={(v) => {
                        setSelectedUserId(v);
                        if (v === "all") {
                          setUsersSearchInput("");
                          setUsersSearchCommitted("");
                          setUsers([]);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[220px] h-9 text-xs rounded-lg border-gray-200 bg-white/80 ">
                        <SelectValue placeholder={dt("كل المشتركين")} />
                      </SelectTrigger>
                      <SelectContent dir={dashDir()}>
                        <div className="p-2 border-b border-slate-100 flex gap-1.5 flex-row-reverse items-center">
                          <Input
                            placeholder={dt("بحث… ثم Enter أو زر البحث")}
                            value={usersSearchInput}
                            onChange={(e) => setUsersSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitUsersSearch();
                              }
                            }}
                            className="w-full h-8 text-xs flex-1 min-w-0"
                          />
                          <button
                            type="button"
                            title={dt("بحث")}
                            disabled={usersSearchLoading}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              commitUsersSearch();
                            }}
                            className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white/90 hover:bg-gray-50  disabled:opacity-50"
                          >
                            {usersSearchLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                            ) : (
                              <Search className="w-3.5 h-3.5 text-brand" />
                            )}
                          </button>
                        </div>
                        <SelectItem value="all" className="text-xs">
                          {dt("الكل")}</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">
                            {u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 text-start">
                    <label className="text-[11px] font-semibold text-slate-600">{dt("الحالة")}</label>
                    <Select
                      value={subStatusFilter}
                      onValueChange={(v) => setSubStatusFilter(v as SubscriptionStatusFilter)}
                    >
                      <SelectTrigger className="w-max h-9 text-xs rounded-lg border-gray-200 bg-white/80 ">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={dashDir()}>
                        <SelectItem value="ACTIVE" className="text-xs">
                          {dt("نشطة")}</SelectItem>
                        <SelectItem value="PAUSED" className="text-xs">
                          {dt("موقوفة")}</SelectItem>
                        <SelectItem value="CANCELLED" className="text-xs">
                          {dt("ملغاة")}</SelectItem>
                        <SelectItem value="PAYMENT_FAILED" className="text-xs">
                          {dt("تعذّر الخصم")}</SelectItem>
                        <SelectItem value="all" className="text-xs">
                          {dt("الكل")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Select
                    value={`${subsSortBy}-${subsSortOrder}`}
                    onValueChange={(v) => {
                      const [by, order] = v.split("-") as ["date" | "amount", "asc" | "desc"];
                      setSubsSortBy(by);
                      setSubsSortOrder(order);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[200px] h-9 text-xs rounded-lg border-gray-200 bg-white/80 " dir={dashDir()}>
                      <SelectValue placeholder={dt("ترتيب")} />
                    </SelectTrigger>
                    <SelectContent dir={dashDir()}>
                      <SelectItem value="date-desc">{dt("الأحدث أولاً")}</SelectItem>
                      <SelectItem value="date-asc">{dt("الأقدم أولاً")}</SelectItem>
                      <SelectItem value="amount-desc">{dt("الأعلى مبلغاً")}</SelectItem>
                      <SelectItem value="amount-asc">{dt("الأقل مبلغاً")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto" dir={dashDir()}>
                <table className="w-full text-xs text-start leading-snug">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 ">
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dt("المشترك")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{dt("مبلغ الدفعة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dt("الحالة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 max-w-[160px]">{dt("المشروع / الفئة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dt("الإحالة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{dt("الدورية")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{dt("آخر دفعة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{dt("الدفعة القادمة")}</th>
                      <th className="text-start py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{dt("بدء الاشتراك")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsLoading && subsRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-14 text-center">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand" />
                        </td>
                      </tr>
                    ) : !subsFetchedOnce ? (
                      <tr>
                        <td colSpan={9} className="py-14 text-center text-slate-500">
                          {dt("جاري التحميل...")}</td>
                      </tr>
                    ) : subsRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-14 text-center text-slate-500">
                          {dt("لا توجد اشتراكات تطابق التصفية")}</td>
                      </tr>
                    ) : (
                      subsRows.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-slate-100 /80 hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="py-2.5 px-3 align-top">
                            <button
                              type="button"
                              onClick={() => s.donor?.id && openUserProfile(s.donor.id)}
                              className="text-start w-full max-w-[200px] rounded-md -mx-0.5 px-0.5 py-0 hover:bg-slate-100/80 transition-colors cursor-pointer border-0 bg-transparent"
                            >
                              <p className="font-medium text-slate-900">{s.donor?.name || "—"}</p>
                              {s.donor?.email && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{s.donor.email}</p>
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 align-top" dir={dashDir()}>
                            <span dir="ltr">
                              {formatMoney(s.amount, s.currency, s.amountUSD ?? undefined)}
                            </span>
                            {(s.status === "ACTIVE" || s.status === "PAUSED") && (
                              <button type="button" className="block mt-1 text-[11px] text-brand underline hover:text-brand/80" onClick={() => { setReducePlan(s); setReduceAmount(""); setReduceEvidence(""); }}>
                                {dt("تخفيض مبلغ الاشتراك")}</button>
                            )}
                            {/* Daily / Friday plans also show what they add up to in a month. */}
                            {s.frequency && s.frequency !== "MONTHLY" && s.monthlyEquivalentUSD != null && (
                              <span className="block text-[10px] font-normal text-slate-500">
                                ≈ <span dir="ltr">{formatMoney(s.monthlyEquivalentUSD, undefined, undefined, true)}</span> {dt(" شهريًا")}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 align-top min-w-[118px]">
                            <div className="flex items-center justify-end flex-row-reverse gap-1">
                              <Select
                                value={s.status}
                                disabled={subsStatusUpdatingId === s.id}
                                onValueChange={(v) =>
                                  handleSubscriptionStatusChange(
                                    s.id,
                                    v as SubscriptionRow["status"],
                                    s.status
                                  )
                                }
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-7 text-[11px] w-full border-gray-200 bg-white/90 py-0",
                                    s.status === "ACTIVE" && "text-brand border-brand/20",
                                    s.status === "PAUSED" && "text-brand-orange border-brand-orange/20",
                                    s.status === "CANCELLED" && "text-slate-700 border-slate-200",
                                    s.status === "PAYMENT_FAILED" && "text-red-700 border-red-200"
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent dir={dashDir()}>
                                  {/* Set by the scheduler when the retry ladder is exhausted;
                                      an admin moves it back to نشطة once the card is fixed. */}
                                  <SelectItem value="PAYMENT_FAILED" className="text-xs" disabled>
                                    {dt("تعذّر الخصم")}</SelectItem>
                                  <SelectItem value="ACTIVE" className="text-xs">
                                    {dt("نشطة")}</SelectItem>
                                  <SelectItem value="PAUSED" className="text-xs">
                                    {dt("موقوفة")}</SelectItem>
                                  <SelectItem value="CANCELLED" className="text-xs">
                                    {dt("ملغاة")}</SelectItem>
                                </SelectContent>
                              </Select>
                              {subsStatusUpdatingId === s.id && (
                                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-brand" />
                              )}
                            </div>
                            {/* Local status vs the payment provider's  a mismatch is shown, never hidden. */}
                            <div className="mt-1 text-[10px] leading-4">
                              {providerChecks[s.id]?.loading ? (
                                <span className="text-slate-400">{dt("جاري التحقق…")}</span>
                              ) : providerChecks[s.id]?.result ? (
                                (() => {
                                  const r = providerChecks[s.id]!.result!;
                                  if (r.error) return <span className="font-bold text-red-700">{dtx("تعذّر التحقق: {0}", [r.error])}</span>;
                                  if (r.rail !== "STRIPE") return <span className="text-slate-500">{r.rail === "ALBARAKA" ? dt("جدولة داخلية (البركة)") : r.rail === "PAYPAL" ? dt("جدولة داخلية (PayPal)") : dt("لا يوجد اشتراك لدى مزوّد")}</span>;
                                  return r.inSync ? (
                                    <span className="text-emerald-700">Stripe: {r.providerStatus}{r.providerPaused ? dt(" (موقوف)") : ""} ✓</span>
                                  ) : (
                                    <span className="font-bold text-red-700">
                                      SYNC ERROR  Stripe: {r.providerStatus}{r.providerPaused ? dt(" (موقوف)") : ""}
                                    </span>
                                  );
                                })()
                              ) : (
                                <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => void checkProviderState(s.id)}>
                                  {dt("تحقق من المزوّد")}</button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-[160px] align-top">
                            {s.campaigns?.length > 0 ? (
                              <span>{s.campaigns.map((c) => c.title).join(dt("، "))}</span>
                            ) : s.categories?.length > 0 ? (
                              <span>{dt("فئة: ")}{s.categories.map((c) => c.name).join(dt("، "))}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            {s.referral ? (
                              <Link
                                href={`/dashboard/referrals/${s.referral.id}`}
                                className="text-xs font-medium text-brand hover:underline"
                              >
                                {s.referral.code}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 align-top whitespace-nowrap">
                            <FrequencyBadge frequency={s.frequency} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 align-top whitespace-nowrap">
                            {s.lastBillingDate
                              ? new Date(s.lastBillingDate).toLocaleDateString(dashIntl("ar-EG"), {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 align-top whitespace-nowrap">
                            {s.nextBillingDate
                              ? new Date(s.nextBillingDate).toLocaleDateString(dashIntl("ar-EG"), {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 align-top whitespace-nowrap">
                            {new Date(s.createdAt).toLocaleDateString(dashIntl("ar-EG"), {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {hasMoreSubs && (
                <div className="p-4 border-t border-slate-100  text-center bg-slate-50/30 ">
                  <button
                    type="button"
                    onClick={loadMoreSubs}
                    disabled={subsLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand text-white text-sm font-medium disabled:opacity-50 shadow-sm"
                  >
                    {subsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4 rotate-180" />
                    )}
                    {dt("عرض المزيد")}</button>
                </div>
              )}
              {subsTotal > 0 && (
                <p className="text-xs text-slate-500 px-4 py-2 border-t border-slate-100  text-start bg-muted/20">
                  {dtx("عرض {0} من {1} اشتراك", [subsRows.length, subsTotal])}</p>
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
      <ExportReportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        endpoint="/api/admin/monthly/export"
        title={dt("تصدير تقرير التبرعات المتكررة")}
        description={dt("يشمل التقرير الاشتراكات المتكررة (يومي، أسبوعياً، شهري) ودفعاتها مع ملخص كامل وتفصيل لكل حملة من الأعلى إلى الأدنى.")}
        defaults={(() => {
          const { start, end } = getDonationsDateRange(chartPeriod, dateFrom, dateTo);
          return {
            ...EXPORT_DEFAULTS,
            // Coerce every preset to "custom" so the export uses the Istanbul
            // range we computed (matches اليوم / أمس / شهر / سنة on screen).
            period: chartPeriod === "all" ? "all" : "custom",
            start: start ?? "",
            end: end ?? "",
            categoryId: selectedCategory,
            campaignId: selectedCampaign,
            status: donationsStatusFilter,
            subStatus: subStatusFilter === "all" ? "all" : subStatusFilter,
            frequency: frequencyFilter,
            country: donationCountryFilter,
            sortBy: donationsSortBy,
            sortOrder: donationsSortOrder,
          } as ExportFormState;
        })()}
        options={{
          categories: categories.map((c) => ({ value: c.id, label: c.name })),
          campaigns: campaigns.map((c) => ({ value: c.id, label: c.title })),
          countries: countryOptions.map((c) => ({ value: c.code, label: c.code })),
          locales: [
            { value: "ar", label: dt("العربية") },
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
          subStatus: true,
          frequency: true,
          locale: true,
          country: true,
          sort: true,
          limit: true,
        }}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto" dir={dashDir()}>
      <div className="h-16 rounded-lg bg-slate-200 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />
        ))}
      </div>
      <div className="h-[480px] rounded-lg bg-slate-200 animate-pulse" />
      <div className="h-64 rounded-lg bg-slate-200 animate-pulse" />
    </div>
  );
}
