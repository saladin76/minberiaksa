"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { dt, dashDir, dtMaybe } from "@/lib/dashboard/i18n";
import { LOCALES, type SupportedLocale } from "@/lib/locales";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { EditorModal } from "./EditorModal";
import type { TextValues } from "@/lib/content-editor/contracts";
import { groupEditorialJobs } from "@/lib/content-editor/editorial-view";
import { CalendarDays, CheckCheck, Globe2, Loader2, RefreshCw, Settings2, Sparkles } from "lucide-react";
const RichEditor = dynamic(() => import("@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor"), { ssr: false });
type Job = { id: string; kind: string; status: string; locale: string; title?: string; sourceId?: string; resultContentId?: string; error?: string; version: string; createdAt: string; attempts: number; result?: { values: TextValues; notes?: string[]; research?: { summary?: string; sources?: { url: string; title?: string }[] } } };
type Settings = { weeklyEnabled: boolean; market: string; configured: boolean };
type Listing = { jobs: Job[]; nextCursor: string | null; counts: { status: string; _count: number }[]; settings: Settings };
const STATUS: Record<string, string> = { QUEUED: "في الانتظار", RUNNING: "قيد التجهيز", REVIEW: "جاهز للمراجعة", APPLIED: "تم الاعتماد", FAILED: "فشل التجهيز", STALE: "تغير المصدر", CANCELLED: "ملغى" };
const KIND: Record<string, string> = { ARTICLE: "مقال الأسبوع", TRANSLATION: "ترجمة مقال", IMPROVE_ARTICLE: "تحسين مقال" };
const LABELS: Record<string, string> = { title: "العنوان", description: "الملخص", content: "المحتوى", metaTitle: "عنوان البحث", metaDescription: "وصف البحث", seoKeyword: "العبارة الرئيسية المستهدفة", imageAlt: "وصف الصورة", ogTitle: "عنوان المشاركة", ogDescription: "وصف المشاركة", faqContent: "الأسئلة الشائعة" };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || "HTTP " + response.status); return body as T;
}
function richValue(value: string) { try { return JSON.parse(value); } catch { return value || { type: "doc", content: [{ type: "paragraph" }] }; } }
export function EditorialPlanner({ initialArticleId = "" }: { initialArticleId?: string }) {
  const [listing, setListing] = useState<Listing | null>(null), [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState(initialArticleId ? "create" : "tasks");
  const [articles, setArticles] = useState<{id: string; title: string}[]>([]), [articleSearch, setArticleSearch] = useState("");
  const [articleError, setArticleError] = useState(""), [articlesLoading, setArticlesLoading] = useState(false);
  const refreshGeneration = useRef(0);
  const [loading, setLoading] = useState(false);
  const [reviewUploads, setReviewUploads] = useState(0);
  const [savedArticleId, setSavedArticleId] = useState("");
  const trackReviewUpload = useCallback((uploading: boolean) => setReviewUploads(count => Math.max(0, count + (uploading ? 1 : -1))), []);
  const [filter, setFilter] = useState(""), [cursor, setCursor] = useState<string | null>(null);
  const [articleId, setArticleId] = useState(initialArticleId), [busy, setBusy] = useState(""), [message, setMessage] = useState("");
  const [review, setReview] = useState<Job | null>(null), [values, setValues] = useState<TextValues>({});
  const [queued, setQueued] = useState<number | null>(null), [reviewLoading, setReviewLoading] = useState(false);
  const enqueueController = useRef<AbortController | null>(null);
  const dirtyReview = Boolean(review && JSON.stringify(values) !== JSON.stringify(review.result?.values || {}));
  const dirtySettings = Boolean(settings && listing && (settings.weeklyEnabled !== listing.settings.weeklyEnabled || settings.market !== listing.settings.market));
  useDashboardUnsavedChanges(dirtyReview || dirtySettings);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setLoading(true);
    const query = new URLSearchParams(); if (filter) query.set("status", filter); if (cursor) query.set("cursor", cursor);
    try {
      const result = await api<Listing>("/api/admin/editorial-jobs?" + query);
      if (generation !== refreshGeneration.current) return;
      setListing(result); setSettings((current) => current || result.settings);
    } finally { if (generation === refreshGeneration.current) setLoading(false); }
  }, [filter, cursor]);
  useEffect(() => {
    let active = true;
    const generation = refreshGeneration;
    void refresh().catch((error) => { if (active) setMessage(dtMaybe(error.message)); });
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 10000);
    return () => { active = false; generation.current++; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (view !== "create") return;
    const controller = new AbortController();
    setArticlesLoading(true); setArticleError("");
    const query = new URLSearchParams({q: articleSearch, selected: articleId});
    const timer = setTimeout(() => { void api<{items?: {id: string; title: string}[]}>("/api/admin/editorial-jobs/articles?" + query, {signal: controller.signal})
      .then(result => { if (!controller.signal.aborted) setArticles(result.items || []); })
      .catch(() => { if (!controller.signal.aborted) setArticleError(dt("تعذر تحميل المقالات. أعد فتح هذا التبويب للمحاولة.")); })
      .finally(() => { if (!controller.signal.aborted) setArticlesLoading(false); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [view, articleSearch, articleId]);
  useEffect(() => () => enqueueController.current?.abort(), []);
  const action = async (name: string, extra: Record<string, unknown> = {}) => {
    setBusy(name); setMessage("");
    try {
      const result = await api<{ created?: boolean }>("/api/admin/editorial-jobs", { method: "POST", body: JSON.stringify({ action: name, ...extra }) });
      setMessage(result.created === false ? dt("المهمة موجودة بالفعل.") : dt("تم تنفيذ الطلب. راجع حالة المهام أدناه."));
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تنفيذ العملية")); }
    finally { setBusy(""); }
  };
  const enqueueTranslations = async () => {
    const controller = new AbortController(); enqueueController.current = controller;
    setBusy("translations"); setQueued(0); setMessage(""); let next: string | null = null, total = 0;
    try {
      do {
        const result: { created: number; nextCursor: string | null } = await api("/api/admin/editorial-jobs", { method: "POST", signal: controller.signal, body: JSON.stringify({ action: "translations", cursor: next }) });
        total += result.created; setQueued(total); next = result.nextCursor; await refresh();
      } while (next && !controller.signal.aborted);
      setMessage(dt("تم تجهيز قائمة مهام الترجمة للمراجعة."));
    } catch (error) { setMessage(controller.signal.aborted ? dt("توقف تجهيز القائمة. المهام التي أضيفت محفوظة وتظهر أدناه.") : error instanceof Error ? dtMaybe(error.message) : dt("تعذر تنفيذ العملية")); }
    finally { setBusy(""); await refresh(); }
  };
  const openReview = async (id: string) => {
    setReviewLoading(true); setMessage("");
    try { const job = await api<Job>("/api/admin/editorial-jobs/" + id); setReview(job); setValues(job.result?.values || {}); }
    catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تحميل المراجعة")); }
    finally { setReviewLoading(false); }
  };
  const closeReview = () => { if (busy === "apply" || reviewUploads) return; if (!dirtyReview || window.confirm(dt("توجد تعديلات غير محفوظة. مغادرة المحرر؟"))) setReview(null); };
  const applyReview = async () => {
    if (!review || reviewUploads) return; setBusy("apply"); setMessage("");
    try {
      const result = await api<{ contentId: string }>("/api/admin/editorial-jobs/" + review.id, { method: "POST", body: JSON.stringify({ action: "apply", version: review.version, values }) });
      setSavedArticleId(result.contentId); setReview(null); setValues({});
      setMessage(dt("تم اعتماد المراجعة وحفظ المحتوى. افتحه للتحقق من النتيجة.")); await refresh();
    } catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تأكيد الحفظ. احتفظ بالمراجعة وأعد المحاولة.")); }
    finally { setBusy(""); }
  };
  const changeJob = async (job: Job, name: string) => {
    setBusy(job.id); setMessage("");
    try { await api("/api/admin/editorial-jobs/" + job.id, { method: "POST", body: JSON.stringify({ action: name, version: job.version }) }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تنفيذ العملية")); }
    finally { setBusy(""); }
  };
  const jobActions = (job: Job) => <div className="flex flex-wrap justify-end gap-2">
    {["REVIEW", "STALE", "APPLIED"].includes(job.status) ? <button type="button" disabled={Boolean(busy) || reviewLoading} className="rounded-lg border bg-white px-3 py-2 text-brand" onClick={() => void openReview(job.id)}>{dt("فتح المراجعة")}</button> : null}
    {["FAILED", "CANCELLED"].includes(job.status) ? <button type="button" disabled={Boolean(busy)} className="rounded-lg border bg-white px-3 py-2" onClick={() => void changeJob(job, "retry")}>{dt("إعادة المحاولة")}</button> : null}
    {["QUEUED", "RUNNING", "FAILED", "REVIEW"].includes(job.status) ? <button type="button" disabled={Boolean(busy)} className="rounded-lg border bg-white px-3 py-2 text-slate-500" onClick={() => void changeJob(job, "cancel")}>{dt("إلغاء المهمة")}</button> : null}
    {job.resultContentId || job.sourceId ? <Link href={"/dashboard/content/blog/" + (job.resultContentId || job.sourceId) + "?locale=" + job.locale} className="rounded-lg border bg-white px-3 py-2">{dt("فتح المقال")}</Link> : null}
  </div>;
  const groups = groupEditorialJobs(listing?.jobs || []);
  const countFor = (status: string) => listing?.counts.find(count => count.status === status)?._count ?? 0;
  return <div dir={dashDir()} className="mx-auto max-w-7xl space-y-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand"><Sparkles size={15} />{dt("المحتوى التحريري")}</p><h1 className="text-2xl font-bold">{dt("خطة المقالات والترجمات")}</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">{dt("المهام تجهز اقتراحات قابلة للتحرير والمراجعة. اعتماد مقال جديد يحفظه غير منشور.")}</p></div>
      <button type="button" disabled={loading || Boolean(busy)} onClick={() => void refresh().catch(error => setMessage(dtMaybe(error.message)))} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{dt("تحديث")}</button>
    </header>
    <div className="grid gap-3 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-3">
      <p><span className="me-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs">1</span>{dt("تجهيز الاقتراح")}</p>
      <p><span className="me-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs">2</span>{dt("مراجعة النص والمصادر")}</p>
      <p><span className="me-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs">3</span>{dt("اعتماد المسودة وحفظها")}</p>
    </div>
    {message ? <p role="status" className="rounded-xl border bg-sky-50 p-4 text-sm">{message}</p> : null}
    {savedArticleId ? <Link href={`/dashboard/content/blog/${savedArticleId}`} className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{dt("فتح المقال المحفوظ")}</Link> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{["REVIEW", "QUEUED", "RUNNING", "FAILED"].map(status => <div key={status} className={`rounded-xl border p-4 ${status === "FAILED" && countFor(status) ? "border-amber-200 bg-amber-50" : "bg-white"}`}><p className="text-xs text-slate-500">{dt(STATUS[status])}</p><p className="mt-2 text-2xl font-bold">{listing ? countFor(status) : "—"}</p></div>)}</div>
    <nav role="tablist" aria-label={dt("مساحة العمل التحريري")} className="flex flex-wrap gap-2 rounded-xl border bg-white p-2">
      {[["tasks", "المهام والمراجعة"], ["create", "تجهيز محتوى"], ["settings", "الإعدادات والجدولة"]].map(([key, label]) => <button key={key} id={`editorial-tab-${key}`} role="tab" aria-selected={view === key} aria-controls="editorial-panel" type="button" className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${view === key ? "bg-brand text-white" : "text-slate-500"}`} onClick={() => setView(key)}>{key === "tasks" ? <CheckCheck size={17} /> : key === "create" ? <Sparkles size={17} /> : <Settings2 size={17} />}{dt(label)}</button>)}
    </nav>
    <section id="editorial-panel" role="tabpanel" aria-labelledby={`editorial-tab-${view}`} className="space-y-4">
    {view === "tasks" ? <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{dt("المهام والمراجعة")}</h2><label className="flex items-center gap-3 text-sm">{dt("الحالة")}<select value={filter} onChange={event => { setFilter(event.target.value); setCursor(null); }} className="rounded-lg border bg-white p-2"><option value="">{dt("جميع الحالات")}</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{dt(label)}</option>)}</select></label></div>
      <p className="text-xs text-slate-500">{dt("مهام كل مقال مجمعة معًا؛ افتح المقال لعرض اللغات والحالات والمراجعات.")}</p>
      {!listing ? <p role="status" className="rounded-xl border bg-white p-6">{dt("تحميل المحتوى…")}</p> : !groups.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><CheckCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p>{dt("لا توجد مهام تطابق الحالة المحددة.")}</p></div> : groups.map(group => <details key={group.key} open={group.jobs.some(job => job.status === "REVIEW") || Boolean(filter)} className="overflow-hidden rounded-2xl border bg-white">
        <summary className="cursor-pointer p-4"><span className="font-semibold">{group.jobs[0].title || dt(KIND[group.jobs[0].kind] || group.jobs[0].kind)}</span><span className="ms-3 text-xs text-slate-500">{dt("مهام: {0}", [group.jobs.length])}</span><span className="mt-2 flex flex-wrap gap-2">{[...new Set(group.jobs.map(job => job.status))].map(status => <span key={status} className={`rounded-full px-2 py-1 text-[11px] ${status === "FAILED" ? "bg-amber-50 text-amber-800" : status === "REVIEW" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{dt(STATUS[status] || status)}</span>)}</span></summary>
        <div className="overflow-x-auto border-t"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-start">{dt("المهمة")}</th><th className="p-3">{dt("اللغة")}</th><th className="p-3">{dt("الحالة")}</th><th className="p-3 text-end">{dt("المراجعة")}</th></tr></thead><tbody>{group.jobs.map(job => <tr key={job.id} className="border-t"><td className="min-w-44 p-3"><b>{dt(KIND[job.kind] || job.kind)}</b>{job.error ? <p className="mt-2 max-w-md text-xs leading-6 text-amber-800">{job.error}</p> : null}</td><td className="p-3 text-center">{LOCALES[job.locale as SupportedLocale]?.nativeLabel || job.locale}</td><td className="p-3 text-center">{dt(STATUS[job.status] || job.status)}</td><td className="min-w-52 p-3">{jobActions(job)}</td></tr>)}</tbody></table></div>
      </details>)}
      <div className="flex gap-2">{cursor ? <button type="button" disabled={loading} onClick={() => setCursor(null)} className="rounded-lg border bg-white px-3 py-2 text-sm">{dt("الصفحة الأولى")}</button> : null}{listing?.nextCursor ? <button type="button" disabled={loading} onClick={() => setCursor(listing.nextCursor)} className="rounded-lg border bg-white px-3 py-2 text-sm">{dt("التالي")}</button> : null}</div>
    </> : null}
    {view === "create" ? <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border bg-white p-5"><CalendarDays className="h-6 w-6 text-brand" /><h2 className="font-bold">{dt("المقال الأسبوعي")}</h2><p className="text-sm leading-7 text-slate-500">{dt("اقتراح مقال جديد بموضوع مختلف ومصادر بحث قابلة للمراجعة؛ لا يُنشر تلقائيًا.")}</p><button type="button" disabled={Boolean(busy)} onClick={() => void action("weekly")} className="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">{dt("تجهيز مقال هذا الأسبوع")}</button></section>
      <section className="space-y-4 rounded-2xl border bg-white p-5"><Globe2 className="h-6 w-6 text-brand" /><h2 className="font-bold">{dt("ترجمات المقالات")}</h2><p className="text-sm leading-7 text-slate-500">{dt("تجهيز مهام للحقول واللغات الناقصة فقط، مع الحفاظ على الترجمات الموجودة.")}</p><button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm(dt("تجهيز مهام الترجمة الناقصة لجميع المقالات؟ تُراجع النتائج قبل حفظها."))) void enqueueTranslations(); }} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{dt("تجهيز ترجمات المقالات الناقصة")}</button>{busy === "translations" ? <button type="button" onClick={() => enqueueController.current?.abort()} className="ms-2 rounded-lg border px-3 py-2 text-sm">{dt("إيقاف")}</button> : null}{queued !== null ? <p role="status" className="text-sm">{dt("مهام أضيفت")}: {queued}</p> : null}</section>
      <section className="space-y-4 rounded-2xl border bg-white p-5 lg:col-span-2"><h2 className="font-bold">{dt("تحسين مقال موجود")}</h2><p className="text-sm text-slate-500">{dt("اختر المقال باسمه لتجهيز اقتراح تحسين يمكن مراجعته قبل الحفظ.")}</p>{articleError ? <p role="alert" className="text-sm text-amber-800">{articleError}</p> : null}<div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>{dt("البحث في المقالات")}</span><input aria-label={dt("البحث في المقالات")} maxLength={120} value={articleSearch} onChange={event => setArticleSearch(event.target.value)} placeholder={dt("ابحث بالعنوان")} className="w-full rounded-lg border p-3" /></label><label className="space-y-2 text-sm"><span>{dt("المقال المطلوب تحسينه")}</span><select aria-label={dt("المقال المطلوب تحسينه")} value={articleId} disabled={articlesLoading || Boolean(busy)} onChange={event => setArticleId(event.target.value)} className="w-full rounded-lg border bg-white p-3"><option value="">{articlesLoading ? dt("تحميل المحتوى…") : dt("اختر المقال")}</option>{articleId && !articles.some(article => article.id === articleId) ? <option value={articleId}>{dt("المقال المحدد من المحرر")}</option> : null}{articles.map(article => <option key={article.id} value={article.id}>{article.title || dt("دون عنوان")}</option>)}</select></label></div><button type="button" disabled={Boolean(busy) || articlesLoading || Boolean(articleError) || !/^[a-f0-9]{24}$/i.test(articleId)} onClick={() => void action("improve", {id: articleId})} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{dt("تجهيز تحسين المقال")}</button></section>
    </div> : null}
    {view === "settings" && settings ? <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><CalendarDays size={18} />{dt("المقال الأسبوعي")}</h2><p className="text-sm leading-7 text-slate-500">{dt("التجهيز كل اثنين الساعة 10:00 بتوقيت إسطنبول، بموضوع مختلف ومصادر بحث قابلة للتحقق.")}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.weeklyEnabled} disabled={Boolean(busy)} onChange={event => setSettings({...settings, weeklyEnabled:event.target.checked})} />{dt("تفعيل التجهيز الأسبوعي")}</label><label className="block space-y-2 text-sm"><span>{dt("السوق المستهدف (اختياري)")}</span><input maxLength={120} className="w-full rounded-lg border p-3" value={settings.market} disabled={Boolean(busy)} onChange={event => setSettings({...settings,market:event.target.value})} /></label><button type="button" disabled={Boolean(busy) || !dirtySettings} className="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50" onClick={async () => { setBusy("settings"); try { const saved = await api<Settings>("/api/admin/editorial-jobs",{method:"PUT",body:JSON.stringify({weeklyEnabled:settings.weeklyEnabled,market:settings.market})});setSettings(saved);await refresh();setMessage(dt("تم حفظ الإعدادات")); } catch(error) {setMessage(error instanceof Error ? dtMaybe(error.message):dt("تعذر الحفظ"));} finally {setBusy("");} }}>{dt("حفظ الإعدادات")}</button></section>
      <section className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="font-bold">{dt("تشغيل المهام")}</h2><p className="text-sm leading-7 text-slate-500">{dt("التشغيل اليدوي يجهز الاقتراحات فقط. اعتماد المحتوى خطوة منفصلة بعد المراجعة.")}</p>{!settings.configured ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{dt("خدمة بحث المحتوى غير مهيأة. تبقى المهام في الانتظار حتى استكمال الإعداد.")}</p> : null}<div className="flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy) || !settings.configured} onClick={() => void action("run")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{dt("معالجة الدفعة التالية")}</button><button type="button" disabled={Boolean(busy) || !settings.configured || !countFor("FAILED")} onClick={() => void action("retry-failed")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{dt("إعادة محاولة المهام الفاشلة")}</button></div></section>
    </div> : null}
    </section>
    {busy ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{dt("جار تنفيذ الطلب…")}</p> : null}
    {review ? <EditorModal title={dt("مراجعة المسودة التحريرية")} onClose={closeReview}><div className="max-h-[90vh] w-full max-w-5xl space-y-4 overflow-y-auto rounded-xl bg-white p-6" dir={LOCALES[review.locale as SupportedLocale]?.direction || "rtl"}>
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{dt("مراجعة المسودة التحريرية")}</h2><button type="button" onClick={closeReview} className="rounded border px-3 py-2">{dt("إغلاق")}</button></div>
      {review.status !== "REVIEW" ? <p className="text-sm text-amber-700">{dt(STATUS[review.status] || review.status)}</p> : null}
      {message ? <p role="status" className="rounded border p-3">{message}</p> : null}
      {Object.entries(values).map(([field, value]) => <label key={field} className="block space-y-2 text-sm"><span className="font-semibold">{dt(LABELS[field] || field)}</span>
        {field === "content" ? <RichEditor key={review.id} ariaLabel={dt("المحتوى")} onUploadingChange={trackReviewUpload} isEditable={review.status === "REVIEW" && busy !== "apply"} defaultValue={richValue(value)} onUpdate={(editor) => { if (editor) setValues((previous) => ({ ...previous, content: JSON.stringify(editor.getJSON()) })); }} className="min-h-64 rounded border p-3" />
          : <textarea aria-label={dt(LABELS[field] || field)} disabled={review.status !== "REVIEW" || busy === "apply"} value={value} onChange={(event) => setValues((previous) => ({ ...previous, [field]: event.target.value }))} className="min-h-20 w-full rounded border p-3" />}
      </label>)}
      {review.result?.notes?.map((note, index) => <p key={index} className="text-sm text-amber-800">{note}</p>)}
      <p className="text-sm">{review.result?.research?.summary}</p><ul className="list-disc ps-5 text-sm">{review.result?.research?.sources?.filter((source) => /^https?:\/\//.test(source.url)).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-brand">{source.title || source.url}</a></li>)}</ul>
      <div className="flex gap-2">{review.status === "REVIEW" ? <button type="button" disabled={Boolean(busy) || reviewUploads > 0} onClick={() => void applyReview()} className="rounded bg-brand px-4 py-2 text-white">{dt("اعتماد المراجعة وحفظ المحتوى")}</button> : null}{review.resultContentId ? <Link href={"/dashboard/content/blog/" + review.resultContentId} className="rounded border px-3 py-2">{dt("فتح المقال")}</Link> : null}</div>
    </div></EditorModal> : null}
  </div>;
}
