"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, FileSearch, Languages, RefreshCw, Search } from "lucide-react";
import { dt, dtMaybe } from "@/lib/dashboard/i18n";
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { CONFIG } from "@/lib/content-editor/contracts";
import { READINESS_KINDS, isReadinessKind, readinessEditorHref, type ReadinessKind, type ReadinessPage } from "@/lib/content-editor/readiness";
import { ContentLanguagePicker } from "./ContentLanguagePicker";
import { readSuggestionJson } from "@/lib/content-editor/suggestion-batch";

const DEFAULT_KINDS = [...READINESS_KINDS];
export function ContentReadinessCenter({ allowedKinds = DEFAULT_KINDS, initialKind }: { allowedKinds?: ReadinessKind[]; initialKind?: ReadinessKind }) {
  const [kind, setKind] = useState<ReadinessKind>(initialKind && allowedKinds.includes(initialKind) ? initialKind : allowedKinds[0] || "campaigns");
  const [locale, setLocale] = useState<SupportedLocale>("ar"), [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [filter, setFilter] = useState("needs-work"), [page, setPage] = useState<ReadinessPage | null>(null);
  const [cursor, setCursor] = useState(""), [history, setHistory] = useState<string[]>([]), [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const permitted = allowedKinds.join(",");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), selected = params.get("kind");
    if (!initialKind && isReadinessKind(selected) && permitted.split(",").includes(selected)) setKind(selected);
  }, [initialKind, permitted]);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setCursor(""); setHistory([]); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setPage(null);
    const params = new URLSearchParams({ kind, q: search, ...(cursor ? { cursor } : {}) });
    fetch("/api/admin/content-editor/readiness?" + params, { cache: "no-store", signal: controller.signal })
      .then(response => readSuggestionJson<ReadinessPage>(response, dt("تعذر فحص جاهزية المحتوى. أعد المحاولة.")))
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(dtMaybe(reason instanceof Error ? reason.message : dt("تعذر التحميل"))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, search, cursor, refresh]);
  const items = page?.items || [];
  const states = items.map(item => item.locales[locale]);
  const translationCount = states.filter(state => state?.contentMissing.length).length;
  const seoCount = states.filter(state => state?.seoMissing.length || state?.invalid.length).length;
  const completed = states.filter(state => state?.complete).length;
  const visible = items.filter(item => { const state = item.locales[locale]; return filter === "all" || filter === "translations" && state.contentMissing.length || filter === "seo" && (state.seoMissing.length || state.invalid.length) || filter === "complete" && state.complete || filter === "needs-work" && !state.complete; });
  const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50";
  return <div className="space-y-5" aria-label={dt("مركز SEO والترجمات")}>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <label className="space-y-2 text-sm"><span>{dt("نوع المحتوى")}</span><select className="block rounded-lg border p-2" value={kind} onChange={event => { setKind(event.target.value as ReadinessKind); setCursor(""); setHistory([]); }}>{allowedKinds.map(code => <option key={code} value={code}>{dt(CONFIG[code].label)}</option>)}</select></label>
      <label className="min-w-48 flex-1 space-y-2 text-sm"><span>{dt("البحث بعنوان المحتوى")}</span><div className="flex items-center gap-2 rounded-lg border px-3"><Search size={16} aria-hidden="true" /><input type="search" className="min-w-0 flex-1 bg-transparent py-2 outline-none" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /></div></label>
      <button className={btn} type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{dt("تحديث الفحص")}</button>
    </div>
    <ContentLanguagePicker value={locale} onChange={setLocale} />
    <div className="grid gap-3 sm:grid-cols-3">
      {[["translations", dt("تحتاج ترجمة"), translationCount, Languages, "text-amber-700 bg-amber-50"], ["seo", dt("تحتاج تحسين SEO"), seoCount, FileSearch, "text-sky-700 bg-sky-50"], ["complete", dt("جاهزة لهذه اللغة"), completed, CheckCircle2, "text-emerald-700 bg-emerald-50"]].map(([value, label, count, Icon, style]) => {
        const MetricIcon = Icon as typeof Languages;
        return <button key={String(value)} type="button" aria-pressed={filter === value} onClick={() => setFilter(String(value))} className={`flex items-center gap-3 rounded-xl border p-4 text-start ${style} ${filter === value ? "ring-2 ring-brand/30" : ""}`}><MetricIcon size={21} /><span className="flex-1 text-sm">{String(label)}<span className="mt-1 block text-xs opacity-75">{dt("في هذه الصفحة")}</span></span><strong className="text-2xl">{loading ? "—" : String(count)}</strong></button>;
      })}
    </div>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">{dt("قائمة العمل")} · {LOCALES[locale].nativeLabel}</h2><p className="mt-1 text-xs text-slate-500">{dt("افتح العنصر على اللغة والحقل المطلوب، راجع الاقتراحات ثم احفظها من المحرر.")}</p></div>
        <label className="text-sm"><span className="sr-only">{dt("حالة المحتوى")}</span><select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border p-2">{[["needs-work", "تحتاج مراجعة"], ["all", "الكل"], ["translations", "الترجمات الناقصة"], ["seo", "SEO غير مكتمل"], ["complete", "مكتمل"]].map(([value, label]) => <option value={value} key={value}>{dt(label)}</option>)}</select></label>
      </div>
      {loading ? <p role="status" className="p-6 text-sm text-slate-500">{dt("جار فحص المحتوى واللغات…")}</p> : error ? <p role="alert" className="p-6 text-sm text-red-700">{error}</p> : visible.length ? <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["المحتوى", "الترجمة", "SEO", "الإجراء"].map(label => <th className="px-4 py-3 text-start font-medium" key={label}>{dt(label)}</th>)}</tr></thead><tbody className="divide-y">{visible.map(item => {
        const state = item.locales[locale], readyLanguages = SUPPORTED_LOCALES.filter(code => item.locales[code].complete).length;
        return <tr key={item.id} className="align-top hover:bg-slate-50/70"><td className="min-w-52 max-w-80 p-4"><Link className="font-semibold text-brand hover:underline" href={readinessEditorHref(kind, item.id, locale, state.contentMissing.length ? "content" : "seo")}>{item.title}</Link><p className="mt-2 text-xs text-slate-500">{dt("جاهزية المحتوى وSEO: {0} / {1} لغة", [readyLanguages, SUPPORTED_LOCALES.length])}</p></td>
          <td className="p-4"><span className={state.contentMissing.length ? "text-amber-700" : "text-emerald-700"}>{state.contentMissing.length ? dt("{0} حقول ناقصة", [state.contentMissing.length]) : dt("مكتمل")}</span></td>
          <td className="p-4"><span className={state.seoMissing.length || state.invalid.length ? "text-amber-700" : "text-emerald-700"}>{state.seoMissing.length ? dt("{0} حقول ناقصة", [state.seoMissing.length]) : dt("مكتمل")}</span>{state.invalid.length ? <p className="mt-1 text-xs text-red-700">{dt("{0} حقول تحتاج تصحيحًا", [state.invalid.length])}</p> : null}</td>
          <td className="p-4"><div className="flex flex-wrap gap-2"><Link className={btn} href={readinessEditorHref(kind, item.id, locale, "content")}><Languages size={14} />{dt("تحرير الترجمة")}</Link><Link className={btn} href={readinessEditorHref(kind, item.id, locale, "seo")}><ArrowUpRight size={14} />SEO</Link></div></td></tr>;
      })}</tbody></table></div> : <p role="status" className="p-8 text-center text-sm text-slate-500">{dt("لا توجد عناصر مطابقة في هذه الصفحة.")}</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-xs text-slate-500"><span>{dt("صفحة {0} · {1} عنصر تم فحصه", [history.length + 1, items.length])}</span><div className="flex gap-2"><button className={btn} type="button" disabled={loading || !history.length} onClick={() => { setCursor(history.at(-1) || ""); setHistory(previous => previous.slice(0, -1)); }}>{dt("السابق")}</button><button className={btn} type="button" disabled={loading || !page?.nextCursor} onClick={() => { setHistory(previous => [...previous, cursor]); setCursor(page?.nextCursor || ""); }}>{dt("التالي")}</button></div></footer>
    </section>
    <p className="text-xs leading-6 text-slate-500">{dt("الجاهزية فحص لاكتمال الحقول وحدودها؛ جودة الترجمة ودقة الحقائق تحتاج مراجعة تحريرية.")}</p>
  </div>;
}
