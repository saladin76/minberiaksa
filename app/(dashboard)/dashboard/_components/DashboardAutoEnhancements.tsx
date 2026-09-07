"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { SaveStatusNotice, type SaveStatusState } from "./SaveStatusNotice";
import { SmartSeoWorkbenchCard } from "./SmartSeoWorkbenchCard";
import { SeoTextImproverCard } from "./SeoTextImproverCard";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

type LocaleCode = SupportedLocale;
type SeoContentType = "campaign" | "category" | "blog";

type SaveEventDetail = {
  phase: "start" | "success" | "error";
  method: string;
  url: string;
  status?: number;
};

type TextSnapshot = {
  type: SeoContentType;
  locale: LocaleCode;
  title: string;
  text: string;
};

declare global {
  interface Window {
    __dashboardSaveStatusPatched?: boolean;
  }
}

const localeByLabel: Record<string, LocaleCode> = {
  العربية: "ar",
  English: "en",
  Français: "fr",
  Türkçe: "tr",
  Bahasa: "id",
  Português: "pt",
  Español: "es",
  Deutsch: "de",
};

const supportedLocales: LocaleCode[] = [...SUPPORTED_LOCALES];

function isDashboardSaveRequest(method?: string, url?: string) {
  const m = String(method || "GET").toUpperCase();
  const u = String(url || "");
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(m)) return false;
  return /\/api\/(campaigns|categories|posts)(\/|\?|$)/.test(u);
}

function dispatchSaveEvent(detail: SaveEventDetail) {
  window.dispatchEvent(new CustomEvent<SaveEventDetail>("dashboard-save-status", { detail }));
}

function patchNetworkSaveEvents() {
  if (typeof window === "undefined" || window.__dashboardSaveStatusPatched) return;
  window.__dashboardSaveStatusPatched = true;

  const originalOpen = window.XMLHttpRequest.prototype.open;
  const originalSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, ...rest: any[]) {
    (this as any).__dashboardMethod = method;
    (this as any).__dashboardUrl = String(url);
    return originalOpen.call(this, method, url, ...rest as [boolean?, string?, string?]);
  } as typeof window.XMLHttpRequest.prototype.open;

  window.XMLHttpRequest.prototype.send = function patchedSend(...args: any[]) {
    const method = (this as any).__dashboardMethod;
    const url = (this as any).__dashboardUrl;
    const shouldTrack = isDashboardSaveRequest(method, url);
    if (shouldTrack) {
      dispatchSaveEvent({ phase: "start", method, url });
      this.addEventListener("loadend", () => {
        const ok = this.status >= 200 && this.status < 300;
        dispatchSaveEvent({ phase: ok ? "success" : "error", method, url, status: this.status });
      });
    }
    return originalSend.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
  } as typeof window.XMLHttpRequest.prototype.send;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const shouldTrack = isDashboardSaveRequest(method, url);
    if (shouldTrack) dispatchSaveEvent({ phase: "start", method, url });
    try {
      const response = await originalFetch(input, init);
      if (shouldTrack) {
        dispatchSaveEvent({ phase: response.ok ? "success" : "error", method, url, status: response.status });
      }
      return response;
    } catch (error) {
      if (shouldTrack) dispatchSaveEvent({ phase: "error", method, url });
      throw error;
    }
  };
}

function ensureHeaderPortal(id: string) {
  const h1 = document.querySelector("main h1");
  const host = h1?.parentElement;
  if (!host) return null;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement("div");
    node.id = id;
    node.dir = "rtl";
    host.appendChild(node);
  }
  return node;
}

/**
 * Mount a portal node next to the sentinel `<div id="dashboard-project-seo-anchor" />`
 * that campaign pages render right before the إنجازات المشروع section (or at
 * form end on the new-campaign page). The node is placed as a sibling
 * *before* the anchor so React's reconciliation of the (empty) anchor div
 * never touches the portal subtree. Returns null when the sentinel is
 * absent (e.g. page still loading) so the portal stays unmounted.
 */
function ensureProjectSeoAnchorPortal(id: string) {
  const anchor = document.getElementById("dashboard-project-seo-anchor");
  if (!anchor?.parentElement) return null;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement("div");
    node.id = id;
    node.dir = "rtl";
  }
  if (node.parentElement !== anchor.parentElement || node.nextElementSibling !== anchor) {
    anchor.insertAdjacentElement("beforebegin", node);
  }
  return node;
}

function readActiveLocale(): LocaleCode {
  const active = document.querySelector('[role="tab"][data-state="active"]') as HTMLElement | null;
  const value = active?.getAttribute("value") || active?.getAttribute("data-value") || "";
  if (supportedLocales.includes(value as LocaleCode)) return value as LocaleCode;
  const text = (active?.textContent || "").trim();
  return Object.entries(localeByLabel).find(([label]) => text.includes(label))?.[1] || "ar";
}

function titleFieldName(locale: LocaleCode) {
  return locale === "ar" ? "title" : `title_${locale}`;
}

function categoryTitleFieldName(locale: LocaleCode) {
  return locale === "ar" ? "name" : `name_${locale}`;
}

function categoryDescriptionFieldName(locale: LocaleCode) {
  return locale === "ar" ? "description" : `description_${locale}`;
}

function findActivePanelWithSelector(selector: string) {
  return Array.from(document.querySelectorAll('[data-state="active"]')).find((el) =>
    (el as HTMLElement).querySelector?.(selector)
  ) as HTMLElement | undefined;
}

function readProjectSeoSnapshot() {
  const locale = readActiveLocale();
  const titleName = titleFieldName(locale);
  const titleInput = document.querySelector(`input[name="${titleName}"]`) as HTMLInputElement | null;
  const activePanel = findActivePanelWithSelector(`input[name="${titleName}"]`);
  const editor = activePanel?.querySelector(".ProseMirror") as HTMLElement | null;
  const title = titleInput?.value || "";
  const description = editor?.innerText || "";
  const imageCount = Math.max(0, document.querySelectorAll('img[alt^="صورة "]').length);
  return { locale, title, description, imageCount };
}

function currentPageType(pathname: string): SeoContentType | null {
  if (pathname.includes("/dashboard/campaigns/edit/")) return "campaign";
  if (pathname.includes("/dashboard/categories/edit/")) return "category";
  if (pathname.includes("/dashboard/blog")) return "blog";
  return null;
}

function ensureTextImproverPortal(pathname: string) {
  const type = currentPageType(pathname);
  if (!type) return null;

  let anchor: HTMLElement | null = null;
  if (type === "campaign") {
    const locale = readActiveLocale();
    const titleName = titleFieldName(locale);
    const panel = findActivePanelWithSelector(`input[name="${titleName}"]`);
    const editor = panel?.querySelector(".ProseMirror") as HTMLElement | null;
    anchor = editor?.closest(".space-y-6, .space-y-4, [class*='space-y']") as HTMLElement | null;
  } else if (type === "category") {
    const locale = readActiveLocale();
    const descName = categoryDescriptionFieldName(locale);
    const textarea = document.querySelector(`textarea[name="${descName}"]`) as HTMLTextAreaElement | null;
    anchor = textarea?.closest(".space-y-2, [class*='space-y'], div") as HTMLElement | null;
  } else {
    const editor = document.querySelector(".ProseMirror") as HTMLElement | null;
    anchor = editor?.closest(".space-y-6, .space-y-4, [class*='space-y'], div") as HTMLElement | null;
  }

  if (!anchor?.parentElement) return null;
  let node = document.getElementById("dashboard-seo-text-improver");
  if (!node) {
    node = document.createElement("div");
    node.id = "dashboard-seo-text-improver";
    node.dir = "rtl";
    node.className = "mb-4";
  }
  if (node.parentElement !== anchor.parentElement || node.nextElementSibling !== anchor) {
    anchor.insertAdjacentElement("beforebegin", node);
  }
  return node;
}

function readTextImproverSnapshot(pathname: string): TextSnapshot {
  const type = currentPageType(pathname) || "campaign";
  const locale = readActiveLocale();

  if (type === "category") {
    const titleInput = document.querySelector(`input[name="${categoryTitleFieldName(locale)}"]`) as HTMLInputElement | null;
    const textarea = document.querySelector(`textarea[name="${categoryDescriptionFieldName(locale)}"]`) as HTMLTextAreaElement | null;
    return { type, locale, title: titleInput?.value || "", text: textarea?.value || "" };
  }

  if (type === "blog") {
    const titleInput = document.querySelector('input[name="title"]') as HTMLInputElement | null;
    const descriptionTextarea = document.querySelector('textarea[name="description"]') as HTMLTextAreaElement | null;
    const editor = document.querySelector(".ProseMirror") as HTMLElement | null;
    const text = editor?.innerText || descriptionTextarea?.value || "";
    return { type, locale, title: titleInput?.value || "", text };
  }

  const titleName = titleFieldName(locale);
  const titleInput = document.querySelector(`input[name="${titleName}"]`) as HTMLInputElement | null;
  const activePanel = findActivePanelWithSelector(`input[name="${titleName}"]`);
  const editor = activePanel?.querySelector(".ProseMirror") as HTMLElement | null;
  return { type, locale, title: titleInput?.value || "", text: editor?.innerText || "" };
}

function statusForPath(pathname: string, detail: SaveEventDetail): SaveStatusState | null {
  const isProject = pathname.includes("/dashboard/campaigns/edit/");
  const isCategory = pathname.includes("/dashboard/categories/edit/");
  const isBlog = pathname.includes("/dashboard/blog");
  if (!isProject && !isCategory && !isBlog) return null;

  const label = isProject ? "المشروع" : isCategory ? "الحملة" : "المقال";
  if (detail.phase === "start") {
    return { type: "saving", message: `جاري حفظ ${label}...`, detail: "لا تغادر الصفحة حتى يكتمل الحفظ" };
  }
  if (detail.phase === "success") {
    return { type: "success", message: `تم تحديث ${label} بنجاح`, detail: "أنت ما زلت داخل صفحة التعديل" };
  }
  return { type: "error", message: `فشل تحديث ${label}`, detail: detail.status ? `رمز الخطأ: ${detail.status}` : "راجع البيانات ثم حاول مرة أخرى" };
}

export function DashboardAutoEnhancements() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [statusNode, setStatusNode] = useState<HTMLElement | null>(null);
  const [seoNode, setSeoNode] = useState<HTMLElement | null>(null);
  const [textNode, setTextNode] = useState<HTMLElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatusState | null>(null);
  const [snapshot, setSnapshot] = useState(() => ({ locale: "ar" as LocaleCode, title: "", description: "", imageCount: 0 }));
  const [textSnapshot, setTextSnapshot] = useState<TextSnapshot>(() => ({ type: "campaign", locale: "ar", title: "", text: "" }));

  // SEO workbench shows on both new + edit campaign pages. Placement is
  // controlled by the page's <div id="dashboard-project-seo-anchor" /> sentinel.
  const isProjectForm =
    pathname.includes("/dashboard/campaigns/edit/") ||
    pathname.endsWith("/dashboard/campaigns/new") ||
    pathname.includes("/dashboard/campaigns/new/");
  const hasTextImprover = Boolean(currentPageType(pathname));

  // This component is mounted by the shell on all 151 dashboard routes, but everything it
  // does is only meaningful on the campaign/category/blog editors:
  //   - isProjectForm    -> campaigns/edit + campaigns/new
  //   - hasTextImprover  -> campaigns/edit, categories/edit, blog  (currentPageType)
  //   - statusForPath    -> campaigns/edit, categories/edit, blog  (a subset of the union)
  // Without this gate every other route paid for a global fetch/XMLHttpRequest patch and a
  // 700ms DOM-polling interval that could never produce a portal.
  const isEnhanceableRoute = isProjectForm || hasTextImprover;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Installed lazily on first visit to an editor route. `patchNetworkSaveEvents` guards on
    // `window.__dashboardSaveStatusPatched`, so this stays a single global install.
    if (isEnhanceableRoute) patchNetworkSaveEvents();
  }, [isEnhanceableRoute]);

  useEffect(() => {
    if (!mounted || !isEnhanceableRoute) return;
    const refreshTargets = () => {
      setStatusNode(ensureHeaderPortal("dashboard-inline-save-status"));
      setSeoNode(isProjectForm ? ensureProjectSeoAnchorPortal("dashboard-project-seo-workbench") : null);
      setTextNode(hasTextImprover ? ensureTextImproverPortal(pathname) : null);
    };
    refreshTargets();
    const timer = window.setInterval(refreshTargets, 700);
    return () => window.clearInterval(timer);
  }, [mounted, pathname, isProjectForm, hasTextImprover, isEnhanceableRoute]);

  useEffect(() => {
    if (!isEnhanceableRoute) return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SaveEventDetail>).detail;
      const next = statusForPath(pathname, detail);
      if (next) setSaveStatus(next);
    };
    window.addEventListener("dashboard-save-status", listener);
    return () => window.removeEventListener("dashboard-save-status", listener);
  }, [pathname]);

  useEffect(() => {
    if (!isProjectForm) return;
    const update = () => setSnapshot(readProjectSeoSnapshot());
    update();
    const timer = window.setInterval(update, 900);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [isProjectForm, pathname]);

  useEffect(() => {
    if (!hasTextImprover) return;
    const update = () => setTextSnapshot(readTextImproverSnapshot(pathname));
    update();
    const timer = window.setInterval(update, 900);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [hasTextImprover, pathname]);

  const statusPortal = useMemo(() => {
    if (!statusNode || !saveStatus) return null;
    return createPortal(<SaveStatusNotice status={saveStatus} />, statusNode);
  }, [statusNode, saveStatus]);

  const seoPortal = useMemo(() => {
    if (!seoNode || !isProjectForm) return null;
    return createPortal(
      <SmartSeoWorkbenchCard
        key={`project-seo-${pathname}-${snapshot.locale}`}
        type="campaign"
        locale={snapshot.locale}
        title={snapshot.title}
        description={snapshot.description}
        imageCount={snapshot.imageCount}
      />,
      seoNode,
    );
  }, [seoNode, isProjectForm, pathname, snapshot]);

  const textPortal = useMemo(() => {
    if (!textNode || !hasTextImprover) return null;
    return createPortal(
      <SeoTextImproverCard
        key={`text-improver-${pathname}-${textSnapshot.type}-${textSnapshot.locale}`}
        type={textSnapshot.type}
        locale={textSnapshot.locale}
        title={textSnapshot.title}
        text={textSnapshot.text}
      />,
      textNode,
    );
  }, [textNode, hasTextImprover, pathname, textSnapshot]);

  return (
    <>
      {statusPortal}
      {seoPortal}
      {textPortal}
    </>
  );
}
