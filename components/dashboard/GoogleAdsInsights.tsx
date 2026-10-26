"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dashIntl, dt } from "@/lib/dashboard/i18n";
import { ga4PeriodKey, type Ga4Period } from "@/lib/marketing/ga4-period";
import type { GoogleAdsPerformanceRow, GoogleAdsReport } from "@/lib/marketing/google-ads-report";

const errors: Record<string, string> = {
  GOOGLE_ADS_CONFIG_MISSING: "أكمل اتصال Google Ads: رقم العميل، Developer Token، وبيانات OAuth. ربط GA4 وحده لا يتيح قراءة حساب الإعلانات.",
  GOOGLE_ADS_CONFIG_INVALID: "راجع رقم عميل Google Ads ورقم المدير وإصدار API في إعداد الاتصال.",
  GOOGLE_ADS_DEFAULT_REQUIRED: "يوجد أكثر من حساب Google Ads. حدد الحساب الافتراضي للتقرير أولًا.",
  GOOGLE_ADS_AUTH_FAILED: "تعذر تجديد اتصال Google Ads. راجع بيانات OAuth وRefresh Token على الخادم.",
  GOOGLE_ADS_ACCESS_DENIED: "رفض Google Ads صلاحية القراءة. تحقق من Developer Token ودور المستخدم والحساب الإداري.",
  GOOGLE_ADS_QUOTA: "وصل حساب Google Ads إلى حد الطلبات. حاول لاحقًا.",
};
export function GoogleAdsInsights({ period }: { period: Ga4Period }) {
  const key = ga4PeriodKey(period), controller = useRef<AbortController | null>(null);
  const [data, setData] = useState<GoogleAdsReport | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"campaigns" | "keywords" | "searchTerms">("keywords");
  useEffect(() => { controller.current?.abort(); setData(null); setError(""); setBusy(false); return () => controller.current?.abort(); }, [key]);
  const load = async () => {
    controller.current?.abort(); const active = new AbortController(); controller.current = active;
    setBusy(true); setError(""); setData(null);
    try {
      const response = await fetch(`/api/admin/google-analytics/google-ads?${new URLSearchParams({ ...period })}`, { signal: active.signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (!active.signal.aborted) setData(result);
    } catch (failure) { if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : "GOOGLE_ADS_REPORT_FAILED"); }
    finally { if (!active.signal.aborted) setBusy(false); }
  };
  const number = (value: number) => value.toLocaleString(dashIntl("ar-EG"), { maximumFractionDigits: 2 });
  const recommendations = data ? data.searchTerms.filter(row => row.clicks >= 10 && row.conversions === 0 && row.cost > 0).slice(0, 5) : [];
  const candidates = data ? data.keywords.filter(row => row.conversions > 0).sort((a, b) => b.conversions - a.conversions).slice(0, 5) : [];
  return <section aria-labelledby="google-ads-insights" className="space-y-4 rounded-xl border bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="google-ads-insights" className="font-bold">Google Ads</h2><p className="mt-1 text-sm text-slate-600">{dt("الكلمات وعبارات البحث وأداء الحملات للحساب الافتراضي خلال الفترة المختارة.")}</p></div><button type="button" disabled={busy} onClick={load} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{busy ? dt("جار التحميل…") : dt("تحميل تقرير الإعلانات")}</button></header>
    <p className="text-xs leading-6 text-slate-500">{dt("تقرير قراءة فقط؛ لا ينشر إعلانات ولا يغير ميزانية. تحويلات Google ليست تأكيدًا لتحصيل التبرع. راجعها مع GA4 وسجل المدفوعات.")}</p>
    {error ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm leading-7 text-amber-900">{dt(errors[error] || "تعذر تحميل تقرير Google Ads. راجع الاتصال وإصدار API ثم حاول مجددًا.")}</p> : null}
    {!data ? <details className="text-xs leading-7 text-slate-600"><summary className="cursor-pointer font-semibold">{dt("متطلبات ربط حساب الإعلانات")}</summary><p>{dt("يلزم Customer ID وDeveloper Token وOAuth Client ID وClient Secret وRefresh Token، ورقم المدير إذا كان الحساب تحت MCC. امنح المستخدم دور القراءة في Google Ads.")}</p><p>{dt("يمكن استخدام اتصال Google Ads المحفوظ أو إعداد المتغيرات على الخادم بواسطة المسؤول؛ لا تُرسل المفاتيح في المحادثة.")}</p></details> : <>
      <p className="text-xs text-slate-500" dir="ltr">{data.customerId} · {data.currency} · {data.timezone} · {data.period.startDate} — {data.period.endDate}</p>
      {data.bounded ? <p className="text-xs text-amber-800">{dt("يعرض التقرير أعلى النتائج حسب التكلفة، وقد لا يشمل جميع صفوف الحساب. لا تعتبر مجموع الصفوف إجماليًا للحساب.")}</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label={dt("نوع تقرير الإعلانات")}>{([['keywords', "الكلمات المفتاحية"], ['searchTerms', "عبارات البحث"], ['campaigns', "الحملات"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={`rounded-lg border px-3 py-2 text-sm ${tab === value ? "bg-brand text-white" : ""}`}>{dt(label)}</button>)}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-slate-50 text-xs"><tr>{[dt("الكلمة أو الحملة"), dt("النقرات"), dt("التكلفة"), dt("تحويلات Google"), dt("قيمة التحويلات")].map(label => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>{data[tab].map((row: GoogleAdsPerformanceRow, index) => <tr key={`${row.campaign}:${row.label}:${index}`} className="border-b"><td className="max-w-sm p-3"><p className="break-words">{row.label}</p><p className="mt-1 text-xs text-slate-500">{row.campaign} {row.matchType}</p></td><td className="p-3">{number(row.clicks)}</td><td className="p-3">{number(row.cost)} {data.currency}</td><td className="p-3">{number(row.conversions)}</td><td className="p-3">{number(row.conversionValue)} {data.currency}</td></tr>)}</tbody></table></div>
      {!data[tab].length ? <p className="text-sm text-slate-500">{dt("لم يُرجع Google صفوفًا لهذه الفترة. بعض عبارات البحث لا تظهر بسبب حدود الخصوصية.")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2"><section className="space-y-2 rounded-lg bg-amber-50 p-4"><h3 className="font-semibold">{dt("مراجعة الإنفاق قبل أي تعديل")}</h3><p className="text-xs leading-6">{dt("هذه العبارات حصلت على 10 نقرات أو أكثر بلا تحويلات مسجلة. راجع ملاءمتها وتأخر التحويل وصفحة الهبوط قبل اقتراح الاستبعاد.")}</p>{recommendations.map((row, index) => <p key={`${row.campaign}:${row.label}:${index}`} className="text-sm">{row.label} · {number(row.cost)} {data.currency} · {row.campaign}</p>)}{!recommendations.length ? <p className="text-xs">{dt("لا توجد حالات بهذه الشروط ضمن النتائج المعروضة.")}</p> : null}</section><section className="space-y-2 rounded-lg bg-emerald-50 p-4"><h3 className="font-semibold">{dt("فرص محتوى وحملات بحث للمراجعة")}</h3><p className="text-xs leading-6">{dt("كلمات لها تحويلات مسجلة؛ استخدم نية البحث لمراجعة عنوان الصفحة والأسئلة الشائعة أو إعداد مسودة حملة جديدة. البيانات المدفوعة لا تثبت ترتيب SEO أو حجم الطلب الكلي.")}</p>{candidates.map((row, index) => <p key={`${row.campaign}:${row.label}:${row.matchType}:${index}`} className="text-sm">{row.label} · {number(row.conversions)} · {row.campaign}</p>)}{!candidates.length ? <p className="text-xs">{dt("لا توجد كلمات محوّلة كافية لاقتراح اتجاه من هذه الفترة.")}</p> : null}<Link className="inline-block text-sm font-semibold underline" href="/dashboard/seo-pages">{dt("فتح مركز المحتوى وSEO")}</Link></section></div>
    </>}
  </section>;
}
