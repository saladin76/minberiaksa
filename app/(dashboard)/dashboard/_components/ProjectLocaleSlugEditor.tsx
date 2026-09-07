"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createRoot, type Root } from "react-dom/client";
import { SeoPanel } from "@/components/dashboard/campaigns/SeoPanel";

const ROOT_ID = "dashboard-project-locale-slug-editor";
const TARGET_SECTION_ID = "dashboard-project-locale-links";
const SEO_ROOT_ID = "dashboard-project-inline-seo-workbench";
const CREATION_REASON_ID = "dashboard-project-creation-failure-reason";

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
  tr: "Türkçe",
  id: "Indonesia",
  pt: "Português",
  es: "Español",
  de: "Deutsch",
};

type LocaleLink = {
  locale: string;
  slug?: string | null;
  url?: string | null;
};

type LocaleLinksResponse = {
  links?: LocaleLink[];
};

function getProjectIdFromPath(pathname: string) {
  const match = pathname.match(/\/dashboard\/campaigns\/edit\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizeDraftSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function setStatus(root: HTMLElement, message: string, tone: "muted" | "ok" | "error" = "muted") {
  const status = root.querySelector("[data-slug-editor-status]") as HTMLElement | null;
  if (!status) return;
  const classes: Record<typeof tone, string> = {
    muted: "mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600",
    ok: "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700",
    error: "mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700",
  };
  status.className = classes[tone];
  status.textContent = message;
}

function buildPayload(root: HTMLElement, links: LocaleLink[]) {
  const payload: { slug?: string; translations?: Record<string, { slug: string }> } = {};
  for (const link of links) {
    const input = root.querySelector(`[data-slug-input="${link.locale}"]`) as HTMLInputElement | null;
    if (!input) continue;
    const slug = normalizeDraftSlug(input.value);
    if (!slug) continue;
    if (link.locale === "ar") {
      payload.slug = slug;
    } else {
      payload.translations = payload.translations || {};
      payload.translations[link.locale] = { slug };
    }
  }
  return payload;
}

function mountSeoPanel(projectId: string, target: HTMLElement) {
  if (document.getElementById(SEO_ROOT_ID)) return;
  const host = document.createElement("div");
  host.id = SEO_ROOT_ID;
  host.className = "mt-5";
  target.appendChild(host);
  const root: Root = createRoot(host);
  root.render(<SeoPanel campaignId={projectId} />);
}

function renderSlugEditor(projectId: string, links: LocaleLink[], target: HTMLElement) {
  if (document.getElementById(ROOT_ID)) {
    mountSeoPanel(projectId, target);
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.dir = "rtl";
  root.className = "mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4";

  const rows = links.map((link) => {
    const label = LANGUAGE_LABELS[link.locale] || link.locale;
    const slug = link.slug || "";
    return `
      <div class="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[120px_1fr_auto] md:items-end">
        <label class="text-sm font-semibold text-slate-800">${label}</label>
        <div>
          <div class="mb-1 text-xs text-slate-500">Slug</div>
          <input data-slug-input="${link.locale}" value="${slug}" dir="ltr" class="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-800" />
        </div>
        <button type="button" data-check-slug="${link.locale}" class="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">فحص</button>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <div class="mb-4">
      <h3 class="text-base font-bold text-slate-900">تعديل الرابط النهائي</h3>
      <p class="mt-1 text-xs text-slate-600">غيّر slug لكل لغة، افحص التوفر، ثم احفظ الروابط فقط بدون تعديل باقي بيانات المشروع.</p>
    </div>
    <div class="grid gap-3">${rows}</div>
    <div class="mt-4 flex flex-wrap gap-2">
      <button type="button" data-save-slugs class="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-[#014f9d]">حفظ الروابط</button>
      <button type="button" data-refresh-slugs class="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100">تحديث البيانات</button>
    </div>
    <div data-slug-editor-status class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">جاهز للتعديل.</div>
  `;

  target.appendChild(root);

  root.querySelectorAll("[data-slug-input]").forEach((node) => {
    const input = node as HTMLInputElement;
    input.addEventListener("blur", () => {
      input.value = normalizeDraftSlug(input.value);
    });
  });

  root.querySelectorAll("[data-check-slug]").forEach((node) => {
    const button = node as HTMLButtonElement;
    button.addEventListener("click", async () => {
      const locale = button.getAttribute("data-check-slug") || "ar";
      const input = root.querySelector(`[data-slug-input="${locale}"]`) as HTMLInputElement | null;
      const slug = normalizeDraftSlug(input?.value || "");
      if (!slug) {
        setStatus(root, "اكتب slug أولًا.", "error");
        return;
      }
      button.disabled = true;
      button.textContent = "جار الفحص...";
      try {
        const response = await fetch(`/api/campaigns/slug/check?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(slug)}&campaignId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data.available) {
          setStatus(root, `الرابط متاح للغة ${LANGUAGE_LABELS[locale] || locale}.`, "ok");
        } else {
          setStatus(root, `الرابط غير متاح للغة ${LANGUAGE_LABELS[locale] || locale}.`, "error");
        }
      } catch {
        setStatus(root, "فشل فحص الرابط. حاول مرة أخرى.", "error");
      } finally {
        button.disabled = false;
        button.textContent = "فحص";
      }
    });
  });

  const saveButton = root.querySelector("[data-save-slugs]") as HTMLButtonElement | null;
  saveButton?.addEventListener("click", async () => {
    const payload = buildPayload(root, links);
    if (!payload.slug && !payload.translations) {
      setStatus(root, "لا توجد روابط صالحة للحفظ.", "error");
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = "جار الحفظ...";
    try {
      const response = await fetch(`/api/campaigns/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Save failed");
      setStatus(root, "تم حفظ الروابط بنجاح. أعد فتح القسم أو اضغط تحديث البيانات لرؤية الروابط الجديدة.", "ok");
    } catch {
      setStatus(root, "فشل حفظ الروابط. راجع الصلاحيات أو حاول مرة أخرى.", "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "حفظ الروابط";
    }
  });

  const refreshButton = root.querySelector("[data-refresh-slugs]") as HTMLButtonElement | null;
  refreshButton?.addEventListener("click", () => window.location.reload());
  mountSeoPanel(projectId, target);
}

function ensureCreationReasonBox() {
  let box = document.getElementById(CREATION_REASON_ID);
  if (box) return box;
  const form = document.querySelector("form");
  box = document.createElement("div");
  box.id = CREATION_REASON_ID;
  box.dir = "rtl";
  box.className = "mb-4 hidden rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";
  form?.parentElement?.insertBefore(box, form);
  return box;
}

function showCreationReason(message: string) {
  const box = ensureCreationReasonBox();
  if (!box) return;
  box.className = "mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";
  box.textContent = message;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function readFirstVisibleEditorText() {
  const editors = Array.from(document.querySelectorAll(".ProseMirror")) as HTMLElement[];
  const visible = editors.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (el.textContent || "").trim().length > 0;
  });
  return (visible?.textContent || "").trim();
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function insertTextIntoVisibleEditor(text: string) {
  const editors = Array.from(document.querySelectorAll(".ProseMirror")) as HTMLElement[];
  const editor = editors.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (!editor || !text) return false;
  editor.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, text);
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

function collectLikelyCreationIssues() {
  const issues: string[] = [];
  const title = (document.querySelector('input[name="title"]') as HTMLInputElement | null)?.value.trim();
  const titleEn = (document.querySelector('input[name="title_en"]') as HTMLInputElement | null)?.value.trim();
  const images = document.querySelectorAll('img[alt="uploaded image"], img[alt="locale cover"], img[src*="res.cloudinary"], img[src*="/uploads/"]');
  const visibleEditorText = readFirstVisibleEditorText();

  if (!title) issues.push("عنوان المشروع العربي مطلوب.");
  if (!visibleEditorText) issues.push("وصف المشروع العربي مطلوب.");
  if (!titleEn && title) issues.push("تم تجهيز العنوان الإنجليزي تلقائيًا من العنوان العربي. اضغط إنشاء مرة أخرى إن لم يرسل الطلب.");
  if (images.length === 0) issues.push("يجب رفع صورة واحدة على الأقل للمشروع.");

  return issues;
}

function parseErrorMessage(responseText: string) {
  try {
    const data = JSON.parse(responseText);
    return data?.message || data?.error || data?.details || data?.reason || null;
  } catch {
    return responseText || null;
  }
}

function setupApiFailureReporter() {
  if ((window as any).__campaignCreateFailureReporterMounted) return;
  (window as any).__campaignCreateFailureReporterMounted = true;

  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function PatchedXHR() {
    const xhr = new OriginalXHR();
    let method = "";
    let url = "";
    const originalOpen = xhr.open;
    xhr.open = function patchedOpen(this: XMLHttpRequest, m: string, u: string | URL, ...rest: any[]) {
      method = String(m || "").toUpperCase();
      url = String(u || "");
      return originalOpen.call(this, m, u, ...rest as [boolean?, string?, string?]);
    } as XMLHttpRequest["open"];
    xhr.addEventListener("loadend", () => {
      if (method === "POST" && url.includes("/api/campaigns") && xhr.status >= 400) {
        const reason = parseErrorMessage(xhr.responseText) || `فشل إنشاء المشروع. كود الخطأ: ${xhr.status}`;
        showCreationReason(String(reason));
      }
    });
    return xhr;
  } as typeof XMLHttpRequest;
}

function setupArabicOnlyCreationFallback() {
  if ((window as any).__campaignNewArabicFallbackMounted) return;
  (window as any).__campaignNewArabicFallbackMounted = true;
  setupApiFailureReporter();

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest('button[type="submit"]') as HTMLButtonElement | null;
    if (!button || !window.location.pathname.includes("/dashboard/campaigns/new")) return;
    if ((button as any).__arabicFallbackReady) return;

    const title = document.querySelector('input[name="title"]') as HTMLInputElement | null;
    const titleEn = document.querySelector('input[name="title_en"]') as HTMLInputElement | null;
    if (title && titleEn && title.value.trim() && !titleEn.value.trim()) {
      setNativeInputValue(titleEn, title.value.trim());
    }

    const arabicDescriptionText = readFirstVisibleEditorText();
    const issues = collectLikelyCreationIssues();
    if (issues.length > 0) showCreationReason(`سبب عدم إنشاء المشروع: ${issues.join(" ")}`);
    if (!arabicDescriptionText) return;

    event.preventDefault();
    event.stopPropagation();

    const englishTab = Array.from(document.querySelectorAll('button[role="tab"]')).find((el) => /English/i.test(el.textContent || "")) as HTMLButtonElement | undefined;
    englishTab?.click();

    window.setTimeout(() => {
      const titleEnAfter = document.querySelector('input[name="title_en"]') as HTMLInputElement | null;
      if (title && titleEnAfter && title.value.trim() && !titleEnAfter.value.trim()) {
        setNativeInputValue(titleEnAfter, title.value.trim());
      }
      insertTextIntoVisibleEditor(arabicDescriptionText);
      (button as any).__arabicFallbackReady = true;
      window.setTimeout(() => button.click(), 400);
    }, 350);
  }, true);
}

export function ProjectLocaleSlugEditor() {
  const pathname = usePathname();
  const isProjectEdit = pathname.includes("/dashboard/campaigns/edit/");
  const isProjectNew = pathname.includes("/dashboard/campaigns/new");
  const projectId = getProjectIdFromPath(pathname);

  useEffect(() => {
    if (!isProjectNew) return;
    setupArabicOnlyCreationFallback();
  }, [isProjectNew, pathname]);

  useEffect(() => {
    if (!isProjectEdit || !projectId) return;

    let cancelled = false;
    let attempts = 0;

    const run = async () => {
      attempts += 1;
      const target = document.getElementById(TARGET_SECTION_ID);
      if (!target) {
        if (attempts < 10) window.setTimeout(run, 500);
        return;
      }

      try {
        const response = await fetch(`/api/campaigns/${projectId}/locale-links`, { cache: "no-store" });
        const data = (await response.json()) as LocaleLinksResponse;
        if (cancelled) return;
        const links = Array.isArray(data.links) ? data.links : [];
        if (links.length > 0) renderSlugEditor(projectId, links, target);
        else mountSeoPanel(projectId, target);
      } catch {
        // Keep the main editor unaffected when this helper cannot load.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isProjectEdit, pathname, projectId]);

  return null;
}
