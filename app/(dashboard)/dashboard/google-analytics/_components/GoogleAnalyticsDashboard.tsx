"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ga4ExtendedPanels, Ga4InsightPanel, SearchConsolePanel } from "@/components/dashboard/Ga4Insights";
import { parseGa4Period, ga4PeriodKey, type Ga4Period } from "@/lib/marketing/ga4-period";
import axios from "axios";
import { Activity, BarChart3, Eye, Loader2, RefreshCw, Users, Wifi } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dashDir, dashIntl, dt } from "@/lib/dashboard/i18n";
import type { Ga4DashboardReport, Ga4Range } from "@/lib/marketing/ga4-reporting";

type ReportResponse = {
  propertyId: string;
  range: Ga4Range;
  period: Ga4Period;
  updatedAt: string;
  cached: boolean;
  report: Ga4DashboardReport;
};

const RANGE_OPTIONS: Array<{ value: Ga4Range; label: string }> = [
  {value: "today", label: "اليوم"},
  {value: "yesterday", label: "أمس"},
  { value: "7d", label: "آخر 7 أيام" },
  { value: "28d", label: "آخر 28 يومًا" },
  { value: "90d", label: "آخر 90 يومًا" },
  {value: "180d", label: "آخر 180 يومًا"},
  {value: "365d", label: "آخر 365 يومًا"},
  {value: "custom", label: "مخصص"},
];

const ERROR_MESSAGES: Record<string, string> = {
  GA4_PERIOD_INVALID: "اختر تاريخ بداية ونهاية صحيحين، بحد أقصى 366 يومًا وحتى اليوم.",
  GA4_PROPERTY_MISSING: "أدخل Property ID في بطاقة Google Analytics الموجودة بإعدادات التتبع.",
  GA4_PROPERTY_INVALID: "رقم Property ID المحفوظ غير صالح. استخدم الرقم من GA4 Admin.",
  GA4_CREDENTIALS_MISSING: "أضف حساب القراءة في بطاقة Google Analytics بإعدادات التتبع، وامنحه دور Viewer على موقع GA4.",
  GA4_CREDENTIALS_INVALID: "ملف حساب الخدمة المحفوظ غير صالح. احفظ ملف JSON أصليًا من Google Cloud.",
  GA4_CREDENTIALS_UNREADABLE: "تعذر فك تشفير بيانات حساب Google المحفوظة. تحقق من INTEGRATION_SETTINGS_ENCRYPTION_KEY على الخادم.",
  GA4_AUTHENTICATION_FAILED: "رفض Google بيانات حساب الخدمة أو تعذر إصدار رمز قراءة. راجع JSON ومفتاح الخدمة.",
  GA4_ACCESS_DENIED: "حساب الخدمة لا يملك صلاحية قراءة هذا الموقع. أضف بريده إلى GA4 بدور Viewer وتأكد من تفعيل Google Analytics Data API في Google Cloud.",
  GA4_QUOTA_EXCEEDED: "وصلت تقارير GA4 إلى حد الطلبات المؤقت. انتظر قليلًا ثم حدّث التقرير.",
  GA4_REPORT_TIMEOUT: "تأخر رد Google Analytics. أعد المحاولة بعد قليل.",
  GA4_REPORT_FAILED: "تعذر تحميل التقرير من Google Analytics. راجع إعداد الموقع والاتصال ثم أعد المحاولة.",
};

function number(value: number, digits = 0) {
  return value.toLocaleString(dashIntl("ar-EG"), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function percent(value: number) {
  return `${number(value * 100, 1)}%`;
}

function chartDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(6, 8)}/${value.slice(4, 6)}`;
}

function dateTime(value?: string) {
  return value ? new Date(value).toLocaleString(dashIntl("ar-EG")) : "—";
}

function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Users }) {
  return <Card className="min-w-0">
    <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 truncate text-2xl font-bold tabular-nums text-slate-900">{value}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{note}</p></div>
      <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Icon className="h-5 w-5" /></span>
    </CardContent>
  </Card>;
}

function EmptyRows({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{text}</p>;
}

export default function GoogleAnalyticsDashboard() {
  const [range, setRange] = useState<Ga4Range>("28d");
  const [period, setPeriod] = useState<Ga4Period>({range: "28d"});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadReport = useCallback(async (selectedPeriod: Ga4Period, force = false) => {
    activeRequest.current?.abort(); const controller = new AbortController(); activeRequest.current = controller;
    setReport(null); setReportLoading(true); setReportError(null);
    try {
      const params = new URLSearchParams({...selectedPeriod, ...(force ? {refresh: String(Date.now())} : {})});
      const response = await axios.get<ReportResponse>(`/api/admin/google-analytics/report?${params}`, {signal: controller.signal});
      if (!controller.signal.aborted) setReport(response.data);
    } catch (error) {
      if (!controller.signal.aborted) setReportError(axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : "GA4_REPORT_FAILED");
    } finally { if (!controller.signal.aborted) setReportLoading(false); }
  }, []);
  useEffect(() => { void loadReport(period); return () => activeRequest.current?.abort(); }, [loadReport, period]);
  const applyCustom = () => {
    try { setPeriod(parseGa4Period({range: "custom", startDate, endDate})); }
    catch { setReportError("GA4_PERIOD_INVALID"); }
  };

  const reportData = report?.report;
  const exceptionTotal = reportData?.exceptionCount ?? 0;
  const metrics = useMemo(() => reportData ? [
    { label: dt("الزوار النشطون"), value: number(reportData.summary.activeUsers), note: dt("زائر نشط خلال الفترة المحددة"), icon: Users },
    { label: dt("الزوار الجدد"), value: number(reportData.summary.newUsers), note: dt("مستخدمون جدد بحسب GA4"), icon: Activity },
    { label: dt("الجلسات"), value: number(reportData.summary.sessions), note: dt("جلسات الزيارة المسجلة"), icon: Wifi },
    { label: dt("مشاهدات الصفحات"), value: number(reportData.summary.screenPageViews), note: dt("إجمالي مشاهدات الصفحات"), icon: Eye },
    { label: dt("الأحداث الرئيسية"), value: number(reportData.summary.keyEvents, 1), note: dt("الأحداث التي عُيّنت كأحداث رئيسية في GA4"), icon: BarChart3 },
    { label: dt("استثناءات مسجلة"), value: number(exceptionTotal), note: dt("أحداث exception التي أرسلها الموقع إلى GA4"), icon: Activity },
  ] : [], [exceptionTotal, reportData]);

  const rateSummary = reportData
    ? `${dt("معدل التفاعل")}: ${percent(reportData.summary.engagementRate)} · ${dt("معدل الارتداد")}: ${percent(reportData.summary.bounceRate)}`
    : "";

  return <section aria-labelledby="ga4-report-heading" dir={dashDir()} className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-wider text-brand">{dt("تقارير الموقع")}</p><h1 id="ga4-report-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-900">Google Analytics 4</h1><p className="mt-1 text-sm text-slate-600">{dt("تقارير الزيارات والصفحات من ربط GA4 الحالي.")}</p></header>
    <Card className="border-blue-100 bg-blue-50/50">
      <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="space-y-1 text-xs text-slate-500"><p>{dt("قد تتأخر بيانات Google. بيانات اليوم قابلة للتحديث.")}</p><Link className="font-medium text-brand underline" href="/dashboard/platform-connections/tracking#ga4-settings">{dt("إعداد GA4 الحالي")}</Link></div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ga4-range" className="text-xs font-semibold text-slate-600">{dt("الفترة")}</label>
          <select id="ga4-range" value={range} onChange={(event) => {const next = event.target.value as Ga4Range; setRange(next); if (next !== "custom") setPeriod({range: next});}} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
            {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{dt(option.label)}</option>)}
          </select>
          {range === "custom" && <><input type="date" aria-label={dt("من تاريخ")} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 rounded border p-2 text-sm" /><input type="date" aria-label={dt("إلى تاريخ")} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-9 rounded border p-2 text-sm" /><Button variant="outline" onClick={applyCustom}>{dt("تطبيق الفترة")}</Button></>}
          <Button variant="outline" onClick={() => void loadReport(period, true)} disabled={reportLoading} className="gap-2">
            {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{dt("تحديث التقارير")}
          </Button>
        </div>
      </CardContent>
    </Card>

    {reportError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{dt("تعذر تحميل تقارير Google Analytics")}</p>
      <p className="mt-1 leading-6">{dt(ERROR_MESSAGES[reportError] ?? "تعذر قراءة إعدادات Google Analytics. تحقق من الصلاحية والإعدادات ثم أعد المحاولة.")}</p>
      {["GA4_PROPERTY_MISSING", "GA4_PROPERTY_INVALID", "GA4_CREDENTIALS_MISSING", "GA4_CREDENTIALS_INVALID", "GA4_CREDENTIALS_UNREADABLE"].includes(reportError) ? <Button asChild variant="link" className="mt-1 h-auto p-0"><Link href="/dashboard/platform-connections/tracking#ga4-settings">{dt("فتح إعدادات GA4 الحالية")}</Link></Button> : null}
    </div> : null}

    {reportLoading && !reportData ? <div className="flex min-h-48 items-center justify-center rounded-xl border bg-white text-slate-500"><Loader2 className="me-2 h-5 w-5 animate-spin" />{dt("جارٍ جلب تقارير GA4")}</div> : null}

    {reportData ? <>
      <p className="text-xs text-slate-500">{dt("الفترة المعروضة")}: {period.range === "custom" ? `${period.startDate} — ${period.endDate}` : dt(RANGE_OPTIONS.find((option) => option.value === period.range)?.label ?? period.range)} {reportData.quality?.timezone ? ` · ${reportData.quality.timezone}` : ""}</p>
      {(reportData.quality?.thresholded || reportData.quality?.sampled || reportData.quality?.dataLoss) && <p role="status" className="rounded border border-amber-200 p-3 text-xs text-amber-800">{dt("توجد حدود إظهار أو عينات أو تجميع في بيانات Google لهذه الفترة. راجعها قبل المقارنة.")}</p>}
      <Ga4InsightPanel key={ga4PeriodKey(period) + report.updatedAt} period={period} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>

      <Card>
        <CardHeader><CardTitle>{dt("حركة الزوار اليومية")}</CardTitle><CardDescription>{rateSummary}</CardDescription></CardHeader>
        <CardContent>
          {reportData.trend.length ? <div className="h-72 w-full" role="img" aria-label={dt("مخطط الزوار والجلسات ومشاهدات الصفحات") }>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reportData.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs><linearGradient id="ga-users" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={chartDate} minTickGap={24} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={42} />
                <Tooltip labelFormatter={(value) => chartDate(String(value))} formatter={(value, name) => [number(Number(value)), dt(String(name))]} />
                <Area type="monotone" dataKey="activeUsers" name={dt("الزوار النشطون")} stroke="#2563eb" strokeWidth={2} fill="url(#ga-users)" />
                <Area type="monotone" dataKey="sessions" name={dt("الجلسات")} stroke="#0f766e" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="screenPageViews" name={dt("مشاهدات الصفحات")} stroke="#f59e0b" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div> : <EmptyRows text={dt("لا توجد بيانات يومية لهذه الفترة.")} />}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle>{dt("الصفحات الأكثر زيارة")}</CardTitle><CardDescription>{dt("ترتيب حسب مشاهدات الصفحة في GA4")}</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[34rem] text-sm"><thead className="border-y bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-start">{dt("الصفحة")}</th><th className="p-3 text-start">{dt("الزوار")}</th><th className="p-3 text-start">{dt("الجلسات")}</th><th className="p-3 text-start">{dt("المشاهدات")}</th></tr></thead><tbody>{reportData.pages.map((row) => <tr className="border-b last:border-0" key={`${row.pagePath}-${row.pageTitle}`}><td className="max-w-[22rem] p-3"><p className="truncate font-mono text-xs" title={row.pagePath}>{row.pagePath || "/"}</p><p className="mt-1 truncate text-xs text-slate-500" title={row.pageTitle}>{row.pageTitle || dt("بدون عنوان")}</p></td><td className="p-3 tabular-nums">{number(row.activeUsers)}</td><td className="p-3 tabular-nums">{number(row.sessions)}</td><td className="p-3 font-semibold tabular-nums">{number(row.screenPageViews)}</td></tr>)}</tbody></table>
          {!reportData.pages.length ? <EmptyRows text={dt("لا توجد صفحات مسجلة في هذه الفترة.")} /> : null}
        </CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>{dt("مصادر الزيارات")}</CardTitle><CardDescription>{dt("القناة الافتراضية للجلسة كما يصنفها GA4")}</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[28rem] text-sm"><thead className="border-y bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-start">{dt("القناة")}</th><th className="p-3 text-start">{dt("الزوار")}</th><th className="p-3 text-start">{dt("الجلسات")}</th><th className="p-3 text-start">{dt("الأحداث الرئيسية")}</th></tr></thead><tbody>{reportData.channels.map((row) => <tr className="border-b last:border-0" key={row.channel}><td className="p-3 font-medium">{row.channel || dt("غير محدد")}</td><td className="p-3 tabular-nums">{number(row.activeUsers)}</td><td className="p-3 tabular-nums">{number(row.sessions)}</td><td className="p-3 tabular-nums">{number(row.keyEvents, 1)}</td></tr>)}</tbody></table>
          {!reportData.channels.length ? <EmptyRows text={dt("لا توجد قنوات مسجلة في هذه الفترة.")} /> : null}
        </CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CompactTable title={dt("أعلى البلدان") } firstColumn={dt("البلد")} rows={reportData.countries.map((row) => [row.country || dt("غير محدد"), number(row.activeUsers), number(row.sessions)])} headers={[dt("الزوار"), dt("الجلسات")]} />
        <CompactTable title={dt("الأجهزة") } firstColumn={dt("نوع الجهاز")} rows={reportData.devices.map((row) => [row.device || dt("غير محدد"), number(row.activeUsers), number(row.sessions)])} headers={[dt("الزوار"), dt("الجلسات")]} />
        <Card className="min-w-0"><CardHeader><CardTitle>{dt("الأحداث الاستثنائية")}</CardTitle><CardDescription>{dt("المسارات التي سجلت exception في GA4")}</CardDescription></CardHeader><CardContent className="p-0">
          {reportData.exceptions.length ? <ul className="divide-y">{reportData.exceptions.map((row) => <li key={row.pagePath} className="flex items-center justify-between gap-2 px-4 py-3 text-sm"><span className="truncate font-mono text-xs" title={row.pagePath}>{row.pagePath || "/"}</span><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{number(row.eventCount)}</span></li>)}</ul> : <EmptyRows text={dt("لا توجد أحداث exception مسجلة في هذه الفترة.")} />}
        </CardContent></Card>
      </div>

      <SearchConsolePanel report={reportData} period={period} />
      <Ga4ExtendedPanels report={reportData} period={period} />

      <p className="text-xs text-slate-500">{dt("آخر تحديث: {0}", [dateTime(report.updatedAt)])}{report.cached ? ` · ${dt("بيانات مخزنة مؤقتًا لمدة قصيرة")}` : ""}</p>
    </> : null}

    <details className="text-xs text-slate-500"><summary className="cursor-pointer">{dt("حول دقة البيانات")}</summary><p className="mt-2">{dt("يعرض التقرير ما وصل إلى GA4 فقط. غياب أحداث الاستثناء لا يثبت خلو الموقع من الأعطال. الأحداث الرئيسية تعتمد على إعداد GA4 ولا تساوي التبرعات المؤكدة.")}</p></details>
  </section>;
}

function CompactTable({ title, firstColumn, rows, headers }: { title: string; firstColumn: string; rows: string[][]; headers: [string, string] }) {
  return <Card className="min-w-0"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[18rem] text-sm"><thead className="border-y bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-start">{firstColumn}</th>{headers.map((header) => <th className="p-3 text-start" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-b last:border-0" key={`${title}-${row[0]}`}><td className="p-3">{row[0]}</td><td className="p-3 tabular-nums">{row[1]}</td><td className="p-3 tabular-nums">{row[2]}</td></tr>)}</tbody></table>{!rows.length ? <EmptyRows text={dt("لا توجد بيانات لهذه الفترة.")} /> : null}</CardContent></Card>;
}
