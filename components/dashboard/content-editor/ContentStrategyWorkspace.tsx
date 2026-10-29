"use client";
import { useEffect, useState } from "react";
import { FileSearch, NotebookPen, Languages } from "lucide-react";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import dynamic from "next/dynamic";
const PageSeoEditor = dynamic(() => import("./PageSeoEditor").then(module => module.PageSeoEditor));
const ContentReadinessCenter = dynamic(() => import("./ContentReadinessCenter").then(module => module.ContentReadinessCenter));
import { READINESS_KINDS, type ReadinessKind } from "@/lib/content-editor/readiness";
const EditorialPlanner = dynamic(() => import("./EditorialPlanner").then(module => module.EditorialPlanner));

export function ContentStrategyWorkspace({ canSeo, canEditorial, initialTab = "seo", initialArticleId = "", allowedKinds = READINESS_KINDS as readonly ReadinessKind[] }: {
  canSeo: boolean; canEditorial: boolean; initialTab?: "seo" | "editorial" | "translations"; initialArticleId?: string; allowedKinds?: readonly ReadinessKind[];
}) {
  const first = initialTab === "translations" && allowedKinds.length ? "translations" : initialTab === "editorial" && canEditorial ? "editorial" : canSeo ? "seo" : allowedKinds.length ? "translations" : "editorial";
  const [tab, setTab] = useState(first);
  const [visited, setVisited] = useState([first]);
  const select = (value: "seo" | "editorial" | "translations") => { setTab(value); setVisited(previous => [...new Set([...previous, value])]); };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "translations" && allowedKinds.length) {
      setTab("translations"); setVisited(previous => [...new Set([...previous, "translations"])]);
    }
  }, [allowedKinds.length]);
  return <div dir={dashDir()} className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <header><h1 className="text-2xl font-bold">{dt("مركز SEO والترجمات")}</h1><p className="mt-2 text-sm leading-7 text-slate-600">{dt("تابع جاهزية المحتوى بكل لغة، أصلح النواقص، وراجع ظهور صفحات الموقع في البحث من مكان واحد.")}</p></header>
    <div role="tablist" aria-label={dt("أدوات المحتوى والبحث")} className="flex flex-wrap gap-2 rounded-xl border bg-white p-2">
      {allowedKinds.length ? <button type="button" role="tab" id="strategy-translations-tab" aria-selected={tab === "translations"} aria-controls="strategy-translations" onClick={() => select("translations")} className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${tab === "translations" ? "bg-brand font-semibold text-white" : "text-slate-600"}`}><Languages size={17} />{dt("جاهزية SEO والترجمات")}</button> : null}
      {canSeo ? <button type="button" role="tab" id="strategy-seo-tab" aria-selected={tab === "seo"} aria-controls="strategy-seo" onClick={() => select("seo")} className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${tab === "seo" ? "bg-brand font-semibold text-white" : "text-slate-600"}`}><FileSearch size={17} />{dt("SEO الصفحات العامة")}</button> : null}
      {canEditorial ? <button type="button" role="tab" id="strategy-editorial-tab" aria-selected={tab === "editorial"} aria-controls="strategy-editorial" onClick={() => select("editorial")} className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${tab === "editorial" ? "bg-brand font-semibold text-white" : "text-slate-600"}`}><NotebookPen size={17} />{dt("المقالات والترجمات")}</button> : null}
    </div>
    {allowedKinds.length && visited.includes("translations") ? <section id="strategy-translations" role="tabpanel" aria-labelledby="strategy-translations-tab" hidden={tab !== "translations"}><ContentReadinessCenter allowedKinds={[...allowedKinds]} /></section> : null}
    {canSeo && visited.includes("seo") ? <section id="strategy-seo" role="tabpanel" aria-labelledby="strategy-seo-tab" hidden={tab !== "seo"}><PageSeoEditor embedded /></section> : null}
    {canEditorial && visited.includes("editorial") ? <section id="strategy-editorial" role="tabpanel" aria-labelledby="strategy-editorial-tab" hidden={tab !== "editorial"}><EditorialPlanner embedded initialArticleId={initialArticleId} /></section> : null}
  </div>;
}
