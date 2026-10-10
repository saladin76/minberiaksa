"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { localeDirection } from "@/lib/locales";
import type { PublicSearchItem } from "@/lib/minbar/public-search";

const magnifier = <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7" /><path d="m16 16 5 5" /></svg>;
export default function HeaderSearch() {
  const locale = useLocale();
  const router = useRouter();
  const direction = localeDirection(locale);
  const isArabic = locale === "ar";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void fetch(`/api/minbar/search?locale=${encodeURIComponent(locale)}&q=${encodeURIComponent(query.trim())}`, { signal: abort.signal })
        .then(async response => { if (!response.ok) throw new Error("search"); return await response.json() as { items: PublicSearchItem[] }; })
        .then(result => { if (!abort.signal.aborted) setItems(result.items); })
        .catch(() => { if (!abort.signal.aborted) setFailed(true); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 250);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [locale, open, query]);
  const short = query.trim().length < 2;
  const submit = () => {
    if (short) return;
    setOpen(false);
    router.push(`/${locale}/search?q=${encodeURIComponent(query.trim().slice(0, 90))}`);
  };
  return <div className="mia-header-search" ref={wrapRef} dir={direction}>
    <button type="button" className="mia-header-search__toggle" aria-expanded={open} aria-controls="mia-header-search-panel" aria-label={isArabic ? "البحث في الموقع" : "Search site"} title={isArabic ? "بحث" : "Search"} onClick={() => setOpen(v => !v)}>{magnifier}</button>
    {open && <div className="mia-header-search__panel" id="mia-header-search-panel">
      <form role="search" onSubmit={event => { event.preventDefault(); submit(); }} className="mia-header-search__form">
        <label htmlFor="mia-header-query">{isArabic ? "ابحث عن مشروع أو مقال أو خبر" : "Search projects, articles and news"}</label>
        <div className="mia-header-search__input"><span aria-hidden="true">{magnifier}</span><input id="mia-header-query" ref={inputRef} value={query} maxLength={90} onChange={event => { setQuery(event.target.value); setItems([]); }} autoComplete="off" placeholder={isArabic ? "اكتب ما تبحث عنه..." : "What are you looking for?"}/><button disabled={short} type="submit">{isArabic ? "بحث" : "Search"}</button></div>
      </form>
      <div className="mia-header-search__results" aria-live="polite">
        {!short && loading ? <p>{isArabic ? "جارٍ البحث..." : "Searching..."}</p> : failed ? <p>{isArabic ? "تعذر البحث مؤقتًا" : "Search unavailable"}</p> : !short && !loading && !items.length ? <p>{isArabic ? "لا توجد نتائج. جرّب كلمة أخرى." : "No results. Try another term."}</p> : items.map(item => <Link key={item.id} href={item.href} onClick={() => setOpen(false)}><small>{item.type === "project" ? (isArabic ? "مشروع" : "Project") : item.type === "news" ? (isArabic ? "خبر" : "News") : (isArabic ? "مقال" : "Article")}</small><b>{item.title}</b></Link>)}
      </div>
      {!short && <button className="mia-header-search__all" type="button" onClick={submit}>{isArabic ? "عرض كل النتائج" : "View all results"}</button>}
    </div>}
  </div>;
}
