"use client";
import { useEffect, useRef, useState } from "react";
import { dt, dashDir, dtMaybe } from "@/lib/dashboard/i18n";
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { MANAGED_SEO_PAGES, PAGE_SEO_FIELDS, managedPagePath, type PageSeoLocales, type PageSeoValues } from "@/lib/content-editor/page-seo-registry";
type Document = { key: string; revision: string | null; defaults: PageSeoLocales; overrides: PageSeoLocales };
type Proposal = { values: PageSeoValues; research: { summary: string; sources: { url: string; title?: string }[] } };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || "HTTP " + response.status); return body as T;
}
export function PageSeoEditor() {
  const [key, setKey] = useState("home"), [locale, setLocale] = useState<SupportedLocale>("ar");
  const [document, setDocument] = useState<Document | null>(null), [draft, setDraft] = useState<PageSeoLocales>({});
  const [proposals, setProposals] = useState<Record<string, Proposal>>({}), [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [market, setMarket] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const generation = useRef<AbortController | null>(null);
  const dirty = Boolean(document && JSON.stringify(draft) !== JSON.stringify(document.overrides));
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    const controller = new AbortController(); generation.current?.abort(); setDocument(null); setMessage(""); setProposals({}); setErrors({});
    api<Document>("/api/admin/page-seo/" + key, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setDocument(result); setDraft(result.overrides); }
    }).catch((error) => { if (!controller.signal.aborted) setMessage(dtMaybe(error.message)); });
    return () => { controller.abort(); generation.current?.abort(); };
  }, [key]);
  const edit = (field: string, value: string) => {
    if (busy === "save") return;
    generation.current?.abort();
    setDraft((previous) => ({ ...previous, [locale]: { ...previous[locale], [field]: value } }));
  };
  const save = async () => {
    if (!document) return; setBusy("save"); setMessage("");
    try {
      const saved = await api<Document>("/api/admin/page-seo/" + key, { method: "PUT", body: JSON.stringify({ revision: document.revision, overrides: draft }) });
      const read = await api<Document>("/api/admin/page-seo/" + key);
      if (read.revision !== saved.revision) throw new Error(dt("تغيرت النسخة بعد الحفظ. احتفظ بتعديلاتك ثم أعد تحميلها للمراجعة."));
      setDocument(read); setDraft(read.overrides); setProposals({}); setMessage(dt("تم الحفظ والتحقق من النسخة المحفوظة"));
    } catch (error) { setMessage(error instanceof Error ? dtMaybe(error.message) : dt("تعذر الحفظ")); }
    finally { setBusy(""); }
  };
  const suggest = async (all: boolean) => {
    if (!document || dirty) { setMessage(dt("احفظ التعديلات أولًا لطلب اقتراح مرتبط بالنسخة الحالية")); return; }
    const controller = new AbortController(); generation.current?.abort(); generation.current = controller;
    const targets = all ? [...SUPPORTED_LOCALES] : [locale]; let cursor = 0, done = 0;
    setBusy("research"); setProposals({}); setErrors({}); setMessage(""); setProgress({ done, total: targets.length });
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, async () => {
      while (cursor < targets.length && !controller.signal.aborted) {
        const target = targets[cursor++];
        try {
          const result = await api<Proposal>("/api/admin/page-seo/" + key, { method: "POST", signal: controller.signal, body: JSON.stringify({ locale: target, revision: document.revision, market }) });
          if (!controller.signal.aborted) setProposals((previous) => ({ ...previous, [target]: result }));
        } catch (error) {
          if (!controller.signal.aborted) setErrors((previous) => ({ ...previous, [target]: error instanceof Error ? dtMaybe(error.message) : dt("تعذر إنشاء الاقتراح") }));
        } finally { done++; if (!controller.signal.aborted) setProgress({ done, total: targets.length }); }
      }
    }));
    if (generation.current === controller) setBusy("");
  };
  const apply = (codes: string[]) => {
    setDraft((previous) => {
      const next = { ...previous }; for (const code of codes) if (proposals[code]) next[code] = { ...next[code], ...proposals[code].values }; return next;
    });
    setProposals((previous) => Object.fromEntries(Object.entries(previous).filter(([code]) => !codes.includes(code))));
    setMessage(dt("طُبّق الاقتراح في المسودة. احفظ التغييرات لاعتماده."));
  };
  return <div dir={dashDir()} className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{dt("SEO الصفحات العامة")}</h1><p className="mt-2 text-sm text-slate-500">{dt("راجع إعدادات البحث والمشاركة لكل صفحة ولغة، ثم احفظ كل التعديلات معًا.")}</p></div>
      <button type="button" onClick={save} disabled={!document || !dirty || Boolean(busy)} className="rounded bg-brand px-4 py-3 text-white disabled:opacity-50">{dt("حفظ جميع اللغات")}</button>
    </header>
    <label className="block space-y-2"><span>{dt("الصفحة")}</span><select value={key} disabled={Boolean(busy)} className="w-full rounded border bg-white p-3" onChange={(event) => { if (!dirty || window.confirm(dt("توجد تعديلات غير محفوظة. مغادرة المحرر؟"))) setKey(event.target.value); }}>{MANAGED_SEO_PAGES.map((page) => <option key={page.key} value={page.key}>{dt(page.label)}</option>)}</select></label>
    {message ? <p role="status" className="rounded border bg-white p-3">{message}</p> : null}
    <div className="flex flex-wrap gap-2">{SUPPORTED_LOCALES.map((code) => <button type="button" key={code} aria-pressed={locale === code} onClick={() => setLocale(code)} className={"rounded border px-3 py-2 text-sm " + (locale === code ? "bg-brand text-white" : "bg-white")}>{LOCALES[code].nativeLabel}</button>)}</div>
    <div className="flex flex-wrap gap-3 rounded border bg-white p-4">
      <label className="flex-1 text-sm">{dt("السوق المستهدف (اختياري)")}<input value={market} onChange={(event) => setMarket(event.target.value)} className="mt-2 w-full rounded border p-2" maxLength={120} /></label>
      <button type="button" disabled={!document || Boolean(busy) || dirty} onClick={() => void suggest(false)} className="rounded border px-3 py-2">{dt("اقتراح SEO للغة الحالية")}</button>
      <button type="button" disabled={!document || Boolean(busy) || dirty} onClick={() => void suggest(true)} className="rounded border px-3 py-2">{dt("اقتراح SEO لجميع اللغات")}</button>
      {busy === "research" ? <button type="button" onClick={() => generation.current?.abort()} className="rounded border px-3 py-2">{dt("إيقاف")}</button> : null}
      {progress ? <p role="status" className="w-full text-sm">{progress.done} / {progress.total}</p> : null}
    </div>
    {document ? <section className="space-y-4 rounded-xl border bg-white p-5" dir={LOCALES[locale].direction}>
      <a href={"/" + locale + managedPagePath(key, locale)} target="_blank" rel="noopener noreferrer" className="text-sm text-brand">{dt("فتح الصفحة")}</a>
      {PAGE_SEO_FIELDS.map(([field, label]) => <label key={field} className="block space-y-2 text-sm"><span className="font-semibold">{dt(label)}</span>
        <textarea disabled={busy === "save"} value={draft[locale]?.[field] || ""} placeholder={document.defaults[locale]?.[field] || ""} onChange={(event) => edit(field, event.target.value)} className="min-h-20 w-full rounded border p-3" maxLength={field === "metaTitle" || field === "ogTitle" ? 70 : field === "metaDescription" ? 170 : field === "ogImage" ? 2048 : field === "imageAlt" ? 200 : 500} />
      </label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy === "save"} checked={draft[locale]?.seoNoIndex === "true"} onChange={(event) => edit("seoNoIndex", String(event.target.checked))} />{dt("منع فهرسة هذه اللغة مع إبقاء الصفحة ظاهرة")}</label>
    </section> : null}
    {Object.keys(proposals).length ? <section className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="font-bold">{dt("مراجعة الاقتراح")}</h2><button type="button" onClick={() => apply(Object.keys(proposals))} className="rounded border px-3 py-2">{dt("تطبيق الجميع في المسودة")}</button></div>
      {Object.entries(proposals).map(([code, proposal]) => <article key={code} dir={LOCALES[code as SupportedLocale].direction} className="space-y-3 rounded border p-4">
        <h3 className="font-bold">{LOCALES[code as SupportedLocale].nativeLabel}</h3>
        {PAGE_SEO_FIELDS.filter(([field]) => field in proposal.values).map(([field, label]) => <label key={field} className="block space-y-1 text-sm"><span>{dt(label)}</span><textarea className="w-full rounded border p-2" value={proposal.values[field] || ""} onChange={(event) => setProposals((previous) => ({ ...previous, [code]: { ...previous[code], values: { ...previous[code].values, [field]: event.target.value } } }))} /></label>)}
        <p className="text-sm">{proposal.research.summary}</p>
        <ul className="list-disc ps-5 text-sm">{proposal.research.sources.filter((source) => /^https?:\/\//.test(source.url)).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-brand">{source.title || source.url}</a></li>)}</ul>
        <button type="button" onClick={() => apply([code])} className="rounded border px-3 py-2">{dt("استخدام في المسودة")}</button>
      </article>)}
    </section> : null}
    {Object.entries(errors).map(([code, error]) => <p key={code} role="alert" className="rounded border border-red-200 p-3 text-sm text-red-700">{LOCALES[code as SupportedLocale].nativeLabel}: {error}</p>)}
  </div>;
}
