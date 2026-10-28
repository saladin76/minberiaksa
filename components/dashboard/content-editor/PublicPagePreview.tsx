"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { dt } from "@/lib/dashboard/i18n";
import { localeDirection } from "@/lib/locales";
import type { ContentKind, ContentRecord, TextValues } from "@/lib/content-editor/contracts";
import { readSuggestionJson } from "@/lib/content-editor/suggestion-batch";
import type { MinbarProject, MinbarProjectUpdate } from "@/lib/minbar/projects";
import type { CategoryPageContent } from "@/lib/minbar/category-page";
import type { SuperCategoryContent } from "@/lib/minbar/super-category";
import type { MinbarArticleDetail } from "@/lib/minbar/posts";
import ProjectDetail from "@/components/minbar/projects/ProjectDetail";
import CategoryLandingPage from "@/components/minbar/categories/CategoryLandingPage";
import SuperCategoryPage from "@/components/minbar/projects/SuperCategoryPage";
import ArticleDetail from "@/components/minbar/blog/ArticleDetail";
import { ctaKeyFor } from "@/lib/minbar/blog-cta";
import AqsaPage from "@/components/minbar/aqsa/AqsaPage";
import ZakatPage from "@/components/minbar/zakat/ZakatPage";
import { verseBlock } from "@/lib/minbar/quran";
import { readFaqDraft } from "@/lib/content-editor/faq";
import Header from "@/components/minbar/shell/Header";
import Footer from "@/components/minbar/shell/Footer";
import "@/styles/minbar/minbar.css";
import "@/styles/minbar/locale-fonts.css";

type Preview = { detail?:{donorCount:number;updates:MinbarProjectUpdate[]}|null; kind: ContentKind; page: MinbarProject | CategoryPageContent | SuperCategoryContent | MinbarArticleDetail; messages: AbstractIntlMessages };
export function PublicPagePreview({ kind, id, locale, changes, settings }: { kind: ContentKind; id: string; locale: string; changes: TextValues; settings: ContentRecord }) {
  const [mobile, setMobile] = useState(false), [data, setData] = useState<Preview | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0), [mount, setMount] = useState<HTMLElement | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // A modal captures this draft once. Refresh explicitly to retry a failed read.
  const payload = JSON.stringify({ locale, changes, settings });
  useEffect(() => {
    const controller = new AbortController(); setError(""); setData(null);
    void fetch(`/api/admin/content-editor/${kind}/${encodeURIComponent(id)}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: payload, signal: controller.signal })
      .then(response => readSuggestionJson<Preview>(response, dt("تعذر تجهيز المعاينة"))).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : dt("تعذر تجهيز المعاينة")); });
    return () => controller.abort();
  }, [kind, id, payload, attempt]);
  const prepareFrame = () => {
    const doc = frame.current?.contentDocument; if (!doc) return;
    doc.documentElement.className = document.documentElement.className;
    doc.documentElement.lang = locale; doc.documentElement.dir = localeDirection(locale);
    doc.body.style.margin = "0";
    doc.head.querySelectorAll("[data-preview-style]").forEach(node => node.remove());
    document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => { const copy = node.cloneNode(true) as HTMLElement; copy.setAttribute("data-preview-style", ""); doc.head.appendChild(copy); });
    setMount(doc.body);
  };
  return <section className="space-y-3 p-3 sm:p-5" aria-label={dt("معاينة الصفحة الفعلية")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-600">{dt("معاينة المسودة بنفس تصميم الموقع؛ إجراءات التبرع والإرسال معطلة داخلها.")}</p><div className="flex gap-2"><button type="button" className="rounded border px-3 py-1 text-sm" aria-pressed={!mobile} onClick={() => setMobile(false)}>{dt("الحاسوب")}</button><button type="button" className="rounded border px-3 py-1 text-sm" aria-pressed={mobile} onClick={() => setMobile(true)}>{dt("الموبايل")}</button></div></div>
    {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm"><p>{error}</p><button type="button" className="mt-2 rounded border bg-white px-3 py-1" onClick={() => setAttempt(value => value + 1)}>{dt("إعادة المحاولة")}</button></div> : !data ? <p role="status" className="p-6 text-sm">{dt("جار تجهيز المعاينة…")}</p> : null}
    <div className="overflow-x-auto rounded-xl border bg-slate-100 p-1"><iframe ref={frame} title={dt("معاينة الصفحة الفعلية")} srcDoc="<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'></head><body></body></html>" onLoad={prepareFrame} className="mx-auto h-[72vh] border-0 bg-white" style={{ width: mobile ? 390 : 1280, maxWidth: mobile ? "100%" : undefined }} /></div>
    {mount && data ? createPortal(<NextIntlClientProvider locale={locale} messages={data.messages} timeZone="Europe/Istanbul"><div className="mia-scope" dir={localeDirection(locale)} onClickCapture={event => { if ((event.target as Element).closest("a")) event.preventDefault(); }} onSubmitCapture={event => event.preventDefault()}>
      <div inert><Header /></div>
      {data.kind === "campaigns" ? <ProjectDetail preview project={data.page as MinbarProject} gallery={(data.page as MinbarProject).images} related={[]} comments={[]} updates={data.detail?.updates || []} donorCount={data.detail?.donorCount || 0} /> : <fieldset disabled style={{border:0,padding:0,margin:0,minWidth:0}}>{data.kind === "super-categories" ? <SuperCategoryPage page={data.page as SuperCategoryContent} /> : data.kind === "categories" ? (data.page as CategoryPageContent).pageTemplate === "aqsa" ? <AqsaPage category={data.page as CategoryPageContent} projects={(data.page as CategoryPageContent).projects} verse={verseBlock(data.messages.quran as Parameters<typeof verseBlock>[0], "isra_1", locale)} isra={verseBlock(data.messages.quran as Parameters<typeof verseBlock>[0], "isra_1", locale)} /> : (data.page as CategoryPageContent).pageTemplate === "zakat" ? <ZakatPage category={data.page as CategoryPageContent} /> : <CategoryLandingPage page={data.page as CategoryPageContent} /> : <ArticleDetail article={data.page as MinbarArticleDetail} ctaKey={ctaKeyFor((data.page as MinbarArticleDetail).category?.slug, (data.page as MinbarArticleDetail).category?.name)} />}</fieldset>}
      {readFaqDraft(changes.faqContent).length ? <section className="mx-auto my-10 max-w-5xl space-y-4 px-4">{readFaqDraft(changes.faqContent).map((item,index) => <details key={index} className="rounded-xl border p-5"><summary>{item.q}</summary><p className="mt-4 whitespace-pre-wrap leading-8">{item.a}</p></details>)}</section> : null}
      <div inert><Footer /></div>
    </div></NextIntlClientProvider>, mount) : null}
  </section>;
}
