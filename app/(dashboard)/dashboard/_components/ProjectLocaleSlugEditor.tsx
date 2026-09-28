"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CREATION_REASON_ID = "dashboard-project-creation-failure-reason";

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
      return (originalOpen as unknown as (...args: unknown[]) => void).call(this, m, u, ...rest);
    } as XMLHttpRequest["open"];
    xhr.addEventListener("loadend", () => {
      if (method === "POST" && url.includes("/api/campaigns") && xhr.status >= 400) {
        const reason = parseErrorMessage(xhr.responseText) || `فشل إنشاء المشروع. كود الخطأ: ${xhr.status}`;
        showCreationReason(String(reason));
      }
    });
    return xhr;
    /* Two hops: a plain function is not structurally a constructor, so it is widened through
       `unknown` before being presented as one. `as typeof XMLHttpRequest` alone was rejected. */
  } as unknown as typeof XMLHttpRequest;
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

/**
 * Guards the "new campaign" form: shows why a create failed and fills the
 * English copy from the Arabic when it was left empty. (The per-language link
 * editor that used to live here is gone: every language shares one slug now.)
 */
export function ProjectLocaleSlugEditor() {
  const pathname = usePathname();
  const isProjectNew = pathname.includes("/dashboard/campaigns/new");

  useEffect(() => {
    if (!isProjectNew) return;
    setupArabicOnlyCreationFallback();
  }, [isProjectNew, pathname]);

  return null;
}
