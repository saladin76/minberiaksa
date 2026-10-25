"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dt, getDashLocale } from "@/lib/dashboard/i18n";
import type { Ga4DashboardReport } from "@/lib/marketing/ga4-reporting";
import type { Ga4Period } from "@/lib/marketing/ga4-period";
import type { Ga4Analysis, Ga4Evidence } from "@/lib/marketing/ga4-analysis";
import { ga4ManagedSeoLink } from "@/lib/marketing/ga4-seo";

const TABLES = {
  campaigns: { title: "مصادر الحملات والإعلانات", note: "الجلسة حسب المصدر والحملة. الأحداث الرئيسية ليست عدد التبرعات المؤكدة.", headers: ["الجلسات", "الزوار", "الأحداث الرئيسية", "التفاعل"] },
  landingPages: {title: "صفحات الدخول وفرص SEO", note: "أول صفحة في الجلسة. افتح محرر SEO للصفحات المدارة باستخدام الفترة نفسها.", headers: ["الجلسات", "الزوار", "الأحداث الرئيسية", "الارتداد"]},
  events: {title: "تفصيل الأحداث", note: "راجع أسماء الأحداث لفهم ما يُحتسب ضمن الأحداث الرئيسية.", headers: ["عدد الأحداث", "الأحداث الرئيسية"]},
  siteSearch: {title: "كلمات البحث داخل الموقع", note: "من search_term عند تفعيل قياس البحث؛ ليست كلمات البحث العضوية في Google.", headers: ["عدد الأحداث", "الزوار"]},
  campaignTerms: {title: "كلمات الحملات الإعلانية", note: "وسوم utm_term المسجلة. كلمات Google العضوية تتطلب بيانات Search Console.", headers: ["الجلسات", "الأحداث الرئيسية"]},
  interests: {title: "الاهتمامات المتاحة", note: "قد تتداخل فئات الجمهور وقد يقيّد Google إظهارها حسب إعدادات البيانات والخصوصية.", headers: ["الزوار", "الجلسات"]},
  browsers: {title: "المتصفحات والأجهزة", note: "قارن الارتداد عبر المتصفحات لاختيار مسارات الاختبار اليدوي.", headers: ["الجلسات", "الارتداد"]},
} as const;
export function Ga4ExtendedPanels({ report, period }: { report: Ga4DashboardReport; period: Ga4Period }) {
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">{Object.entries(TABLES).map(([key, table]) => {
    const data = report.extended?.[key as keyof typeof TABLES];
    return <Card key={key} className="min-w-0"><CardHeader><CardTitle>{dt(table.title)}</CardTitle><CardDescription>{dt(table.note)}</CardDescription></CardHeader><CardContent className="p-0">
      {!data || data.error ? <p className="p-4 text-sm text-amber-800">{dt("تعذّر إتاحة هذا التقرير من Google. لا يُعرض غياب البيانات كقيمة صفرية.")}</p> : <>
        {(data.thresholded || data.sampled) && <p className="px-4 pb-3 text-xs text-amber-800">{dt("هذا التقرير خاضع لحدود إظهار البيانات أو أخذ العينات.")}</p>}
        {data.rows.length ? <div className="max-h-96 overflow-auto"><table className="w-full min-w-[30rem] text-sm"><thead className="sticky top-0 bg-slate-50 text-xs"><tr><th className="p-3 text-start">{dt("البعد")}</th>{table.headers.map((title) => <th key={title} className="p-3 text-start">{dt(title)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => {
            const seo = key === "landingPages" ? ga4ManagedSeoLink(row.dimensions[0] ?? "", period) : null;
            return <tr key={index} className="border-t"><td className="max-w-xs break-words p-3"><span dir="auto">{row.dimensions.join(" · ") || dt("غير محدد")}</span>{seo && <Link href={seo} className="mt-1 block text-xs font-medium text-brand underline">{dt("مراجعة SEO بهذه البيانات")}</Link>}</td>{row.metrics.map((value, position) => <td key={position} className="p-3 tabular-nums">{((key === "campaigns" || key === "landingPages") && position === 3) || (key === "browsers" && position === 1) ? `${(value * 100).toFixed(1)}%` : value.toLocaleString()}</td>)}</tr>;
          })}</tbody></table></div> : <p className="p-4 text-sm text-slate-500">{dt("لا توجد صفوف متاحة لهذه الفترة. قد لا يكون هذا البعد مسجّلًا أو قد تحدّه إعدادات Google.")}</p>}
        {data.rowCount > data.rows.length && <p className="p-4 text-xs text-slate-500">{dt("المعروض أعلى {0} من {1} صفًا", [data.rows.length, data.rowCount])}</p>}
      </>}
    </CardContent></Card>;
  })}</div>;
}

export function SearchConsolePanel({ report, period }: {report: Ga4DashboardReport; period: Ga4Period}) {
  const data = report.organicSearch;
  return <Card><CardHeader><CardTitle>{dt("كلمات بحث Google العضوية · Search Console")}</CardTitle><CardDescription>{dt("الكلمات والصفحات والنقرات والظهور وCTR ومتوسط الترتيب من Search Console، بنفس حساب الخدمة الحالي.")}</CardDescription></CardHeader><CardContent>
    {data?.status === "ready" ? <>
      <p className="mb-3 text-xs text-slate-500">{data.startDate} — {data.endDate} · America/Los_Angeles · {dt("أعلى 50 صفًا متاحًا، وقد تتغير بيانات الأيام الأخيرة. الكلمات المخفية من Google لا تظهر هنا.")}</p>
      {data.summary && <div className="mb-4 flex flex-wrap gap-5 text-sm"><span>{dt("النقرات")}: {data.summary.clicks.toLocaleString()}</span><span>{dt("الظهور")}: {data.summary.impressions.toLocaleString()}</span><span>CTR: {(data.summary.ctr * 100).toFixed(2)}%</span><span>{dt("متوسط الترتيب")}: {data.summary.position.toFixed(1)}</span></div>}
      {data.rows.length ? <div className="max-h-96 overflow-auto"><table className="w-full min-w-[42rem] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["الكلمة", "الصفحة", "النقرات", "الظهور", "CTR", "متوسط الترتيب"].map((label) => <th className="p-3 text-start" key={label}>{dt(label)}</th>)}</tr></thead><tbody>{data.rows.map((row, index) => {
        const href = ga4ManagedSeoLink(row.pagePath, period);
        return <tr className="border-t" key={index}><td className="p-3" dir="auto">{row.query}</td><td className="max-w-xs break-words p-3">{row.pagePath}{href && <Link href={href} className="block text-xs text-brand underline">{dt("مراجعة SEO بهذه البيانات")}</Link>}</td><td className="p-3">{row.clicks}</td><td className="p-3">{row.impressions}</td><td className="p-3">{(row.ctr * 100).toFixed(2)}%</td><td className="p-3">{row.position.toFixed(1)}</td></tr>;
      })}</tbody></table></div> : <p className="text-sm text-slate-500">{dt("لا توجد كلمات بحث متاحة لهذه الفترة.")}</p>}
    </> : <p className="text-sm text-amber-800">{dt("بيانات Search Console غير متاحة لحساب الخدمة الحالي. امنح الحساب نفسه صلاحية قراءة الموقع في Search Console. لا يلزم ربط حساب Google Analytics آخر.")}</p>}
  </CardContent></Card>;
}

export function Ga4InsightPanel({ period }: { period: Ga4Period }) {
  const [result, setResult] = useState<{analysis: Ga4Analysis; evidence: Ga4Evidence[]; reportUpdatedAt: string} | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function analyze() {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/admin/google-analytics/analyze", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...period, locale: getDashLocale()}), signal: abort.signal});
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (!abort.signal.aborted) setResult(body);
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error && cause.message === "GA4_ANALYSIS_NOT_CONFIGURED" ? dt("فعّل مزود الذكاء الاصطناعي الحالي على الخادم لإتاحة التحليل. لم يُنشأ تحليل بديل أو تجريبي.") : dt("تعذّر إعداد تحليل موثق. أعد المحاولة لاحقًا.")); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  return <Card><CardHeader className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{dt("تحليل بالذكاء الاصطناعي")}</CardTitle><CardDescription>{dt("فرص للإعلانات وSEO وتجربة التبرع، مستندة إلى أرقام الفترة المحددة.")}</CardDescription></div><Button disabled={loading} onClick={() => void analyze()}>{loading ? dt("جارٍ التحليل…") : dt("تحليل هذه الفترة")}</Button></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      {result && <><p className="whitespace-pre-wrap text-sm leading-7">{result.analysis.summary}</p><p className="text-xs text-slate-500">{dt("وقت بيانات التقرير")}: {new Date(result.reportUpdatedAt).toLocaleString()}</p>
        <div className="grid gap-3 md:grid-cols-2">{result.analysis.opportunities.map((item, index) => <article key={index} className="space-y-2 rounded-lg border p-4"><strong>{item.title}</strong><p className="text-xs text-slate-500">{dt(({ads: "الإعلانات", seo: "SEO", ux: "تجربة المستخدم", measurement: "القياس"})[item.area])} · {dt("درجة الثقة")}: {dt(({low: "منخفضة", medium: "متوسطة", high: "مرتفعة"})[item.confidence])}</p><p className="text-sm leading-6">{item.finding}</p><p className="text-sm leading-6 font-medium">{item.action}</p>
          <details><summary className="cursor-pointer text-xs text-brand">{dt("الأرقام الداعمة")}</summary><ul className="mt-2 space-y-2 text-xs">{item.evidenceIds.map((id) => {
            const evidence = result.evidence.find((row) => row.id === id); if (!evidence) return null;
            const seo = evidence.dataset === "pages" || evidence.dataset === "landingPages" ? ga4ManagedSeoLink(evidence.label, period) : null;
            return <li key={id}><span dir="auto">{evidence.dataset} · {evidence.label}</span><p dir="ltr">{Object.entries(evidence.metrics).map(([name, value]) => `${name}: ${value}`).join(" · ")}</p>{seo && <Link className="text-brand underline" href={seo}>{dt("مراجعة SEO بهذه البيانات")}</Link>}</li>;
          })}</ul></details>
        </article>)}</div><ul className="list-disc space-y-1 ps-5 text-xs text-slate-500">{result.analysis.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    </CardContent>
  </Card>;
}
