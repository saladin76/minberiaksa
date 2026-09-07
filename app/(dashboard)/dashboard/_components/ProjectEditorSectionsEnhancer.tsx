"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SEO_PORTAL_ID = "dashboard-project-seo-workbench";
const LOCALE_LINKS_ID = "dashboard-project-locale-links";
const HEADER_CLASS = "dashboard-project-section-toggle";

type LocaleLink = {
  locale: string;
  slug?: string | null;
  path?: string | null;
  url?: string | null;
  hasCustomSlug?: boolean;
};

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

function getProjectForm() {
  const h1 = document.querySelector("main h1");
  const root = h1?.closest(".bg-white") || document.querySelector("main");
  return root?.querySelector("form") as HTMLFormElement | null;
}

function getProjectIdFromPath(pathname: string) {
  const match = pathname.match(/\/dashboard\/campaigns\/edit\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isSubmitRow(element: HTMLElement) {
  return Boolean(element.querySelector('button[type="submit"]')) && !element.querySelector("input, textarea, .ProseMirror");
}

function isSectionCandidate(element: HTMLElement) {
  if (!element || element.id === "dashboard-inline-save-status") return false;
  if (element.classList.contains(HEADER_CLASS)) return false;
  if (isSubmitRow(element)) return false;
  return Boolean((element.textContent || "").trim());
}

function getSectionTitle(element: HTMLElement, index: number) {
  if (element.id === SEO_PORTAL_ID) return "SEO الذكي";
  if (element.id === LOCALE_LINKS_ID) return "الرابط النهائي لكل لغة";
  const heading = element.querySelector("h1, h2, h3") as HTMLElement | null;
  const headingText = (heading?.textContent || "").replace(/\s+/g, " ").trim();
  if (headingText) return headingText.slice(0, 80);
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  if (text.includes("المعلومات الأساسية")) return "المعلومات الأساسية";
  if (text.includes("إعدادات المشروع")) return "إعدادات المشروع";
  if (text.includes("صورة") || text.includes("الصور")) return "الصور والوسائط";
  if (text.includes("التبرع") || text.includes("المبلغ")) return "إعدادات التبرع";
  if (text.includes("تحديث") || text.includes("الأخبار")) return "تحديثات المشروع";
  return `قسم ${index + 1}`;
}

function makeToggle(title: string, section: HTMLElement) {
  const button = document.createElement("button");
  button.type = "button";
  button.dir = "rtl";
  button.className = `${HEADER_CLASS} w-full rounded-2xl border border-blue-100 bg-white px-5 py-4 text-right shadow-sm transition hover:border-blue-200 hover:bg-sky-50/50`;
  button.setAttribute("aria-expanded", "false");

  const row = document.createElement("span");
  row.className = "flex items-center justify-between gap-3";

  const textWrap = document.createElement("span");
  textWrap.className = "flex min-w-0 flex-col";

  const titleEl = document.createElement("span");
  titleEl.className = "text-base font-bold text-slate-900";
  titleEl.textContent = title;

  const hintEl = document.createElement("span");
  hintEl.className = "mt-1 text-xs font-medium text-slate-500";
  hintEl.textContent = "اضغط للفتح أو الطي يدويًا";

  const icon = document.createElement("span");
  icon.className = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600";
  icon.textContent = "⌄";

  textWrap.append(titleEl, hintEl);
  row.append(textWrap, icon);
  button.append(row);

  const setOpen = (open: boolean) => {
    const beforeY = window.scrollY;
    section.style.display = open ? "" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    icon.textContent = open ? "⌃" : "⌄";
    window.requestAnimationFrame(() => window.scrollTo({ top: beforeY, behavior: "instant" as ScrollBehavior }));
  };
  setOpen(false);
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  return button;
}

function createLocaleLinksSection(projectId: string) {
  const section = document.createElement("section");
  section.id = LOCALE_LINKS_ID;
  section.dir = "rtl";
  section.className = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  section.innerHTML = `
    <div class="mb-4 flex flex-col gap-1">
      <h2 class="text-lg font-semibold text-slate-900">الرابط النهائي لكل لغة</h2>
      <p class="text-sm text-slate-500">عرض ونسخ روابط المشروع حسب كل لغة. تعديل الرابط نفسه سيكون في خطوة منفصلة بعد اختبار هذه الخطوة.</p>
    </div>
    <div data-locale-links-status class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">جار تحميل الروابط...</div>
    <div data-locale-links-list class="mt-4 grid gap-3"></div>
  `;

  const status = section.querySelector("[data-locale-links-status]") as HTMLElement | null;
  const list = section.querySelector("[data-locale-links-list]") as HTMLElement | null;

  fetch(`/api/campaigns/${projectId}/locale-links`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load links");
      return response.json();
    })
    .then((data: { links?: LocaleLink[] }) => {
      const links = Array.isArray(data.links) ? data.links : [];
      if (!list || !status) return;
      status.style.display = "none";
      list.innerHTML = "";
      if (links.length === 0) {
        status.style.display = "block";
        status.textContent = "لا توجد روابط متاحة لهذا المشروع.";
        return;
      }
      for (const link of links) {
        const row = document.createElement("div");
        row.className = "grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[120px_1fr_auto] md:items-center";

        const label = document.createElement("div");
        label.className = "text-sm font-semibold text-slate-800";
        label.textContent = LANGUAGE_LABELS[link.locale] || link.locale;

        const input = document.createElement("input");
        input.type = "text";
        input.readOnly = true;
        input.dir = "ltr";
        input.value = link.url || link.path || "";
        input.className = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-700";

        const actions = document.createElement("div");
        actions.className = "flex gap-2";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100";
        copyButton.textContent = "نسخ";
        copyButton.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(input.value);
            copyButton.textContent = "تم النسخ";
            window.setTimeout(() => { copyButton.textContent = "نسخ"; }, 1200);
          } catch {
            input.select();
            document.execCommand("copy");
          }
        });

        const openButton = document.createElement("a");
        openButton.className = "flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100";
        openButton.textContent = "فتح";
        openButton.href = input.value || "#";
        openButton.target = "_blank";
        openButton.rel = "noreferrer";

        actions.append(copyButton, openButton);
        row.append(label, input, actions);
        list.append(row);
      }
    })
    .catch(() => {
      if (status) {
        status.textContent = "فشل تحميل روابط اللغات. أعد فتح الصفحة أو راجع الاتصال.";
        status.className = "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700";
      }
    });

  return section;
}

function ensureLocaleLinksSection(projectId: string) {
  const form = getProjectForm();
  if (!form) return false;
  if (document.getElementById(LOCALE_LINKS_ID)) return false;

  const firstSection = Array.from(form.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && isSectionCandidate(child) && child.textContent?.includes("المعلومات الأساسية"),
  );

  const section = createLocaleLinksSection(projectId);
  const beforeY = window.scrollY;
  if (firstSection?.nextElementSibling) {
    firstSection.insertAdjacentElement("afterend", section);
  } else {
    form.insertBefore(section, form.firstChild);
  }
  window.requestAnimationFrame(() => window.scrollTo({ top: beforeY, behavior: "instant" as ScrollBehavior }));
  return true;
}

function placeSeoAsSecondSection() {
  const form = getProjectForm();
  const seo = document.getElementById(SEO_PORTAL_ID);
  if (!form || !seo) return false;

  const children = Array.from(form.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const firstSection =
    children.find((child) => isSectionCandidate(child) && child.textContent?.includes("المعلومات الأساسية")) ||
    children.find((child) => isSectionCandidate(child) && child.id !== SEO_PORTAL_ID);

  if (!firstSection) return false;
  const seoHeader = seo.previousElementSibling instanceof HTMLElement && seo.previousElementSibling.classList.contains(HEADER_CLASS)
    ? seo.previousElementSibling
    : null;

  if (seoHeader && seoHeader.parentElement === form) {
    if (firstSection.nextElementSibling !== seoHeader || seoHeader.nextElementSibling !== seo) {
      const beforeY = window.scrollY;
      firstSection.insertAdjacentElement("afterend", seo);
      firstSection.insertAdjacentElement("afterend", seoHeader);
      window.requestAnimationFrame(() => window.scrollTo({ top: beforeY, behavior: "instant" as ScrollBehavior }));
      return true;
    }
    return false;
  }

  if (firstSection.nextElementSibling !== seo) {
    const beforeY = window.scrollY;
    firstSection.insertAdjacentElement("afterend", seo);
    window.requestAnimationFrame(() => window.scrollTo({ top: beforeY, behavior: "instant" as ScrollBehavior }));
    return true;
  }
  return false;
}

/** Drops toggles left over from when every section was foldable, and re-shows
 *  whatever they had hidden — so a client that is already on the page (or a Fast
 *  Refresh in dev) doesn't end up with a half-collapsed form. */
function removeLegacyToggles(form: HTMLFormElement) {
  let changed = false;

  for (const toggle of Array.from(form.querySelectorAll<HTMLElement>(`.${HEADER_CLASS}`))) {
    const target = toggle.nextElementSibling;
    if (target instanceof HTMLElement && target.id === SEO_PORTAL_ID) continue;
    toggle.remove();
    changed = true;
  }

  for (const section of Array.from(form.children)) {
    if (!(section instanceof HTMLElement)) continue;
    if (section.id === SEO_PORTAL_ID) continue;
    // Only ever touch sections this enhancer itself hid — never a display:none
    // that the form set for its own reasons.
    if (section.dataset.projectCollapsibleSection !== "true") continue;
    delete section.dataset.projectCollapsibleSection;
    section.classList.remove("mt-3");
    if (section.style.display === "none") section.style.display = "";
    changed = true;
  }

  return changed;
}

/** Every section of the project editor stays open. Only the SEO workbench keeps
 *  a fold, since it is long, optional and rarely touched on a given edit. */
function collapseProjectSections(projectId: string) {
  const form = getProjectForm();
  if (!form) return false;
  let changed = ensureLocaleLinksSection(projectId);
  if (placeSeoAsSecondSection()) changed = true;
  if (removeLegacyToggles(form)) changed = true;

  const beforeY = window.scrollY;
  const seo = document.getElementById(SEO_PORTAL_ID);
  if (
    seo instanceof HTMLElement &&
    seo.parentElement === form &&
    isSectionCandidate(seo) &&
    seo.dataset.projectCollapsibleSection !== "true"
  ) {
    seo.dataset.projectCollapsibleSection = "true";
    seo.classList.add("mt-3");
    const toggle = makeToggle(getSectionTitle(seo, 0), seo);
    seo.insertAdjacentElement("beforebegin", toggle);
    seo.style.display = "none";
    changed = true;
  }

  if (placeSeoAsSecondSection()) changed = true;
  if (changed) window.requestAnimationFrame(() => window.scrollTo({ top: beforeY, behavior: "instant" as ScrollBehavior }));
  return changed;
}

export function ProjectEditorSectionsEnhancer() {
  const pathname = usePathname();
  const isProjectEdit = pathname.includes("/dashboard/campaigns/edit/");
  const projectId = getProjectIdFromPath(pathname);

  useEffect(() => {
    if (!isProjectEdit || !projectId) return;

    let attempts = 0;
    const run = () => {
      attempts += 1;
      const changed = collapseProjectSections(projectId);
      if (changed || attempts < 8) {
        window.setTimeout(run, 450);
      }
    };

    run();
  }, [isProjectEdit, pathname, projectId]);

  return null;
}
