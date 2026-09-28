"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SEO_PORTAL_ID = "dashboard-project-seo-workbench";
const HEADER_CLASS = "dashboard-project-section-toggle";

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
 *  whatever they had hidden  so a client that is already on the page (or a Fast
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
    // Only ever touch sections this enhancer itself hid  never a display:none
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
function collapseProjectSections() {
  const form = getProjectForm();
  if (!form) return false;
  let changed = false;
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
      const changed = collapseProjectSections();
      if (changed || attempts < 8) {
        window.setTimeout(run, 450);
      }
    };

    run();
  }, [isProjectEdit, pathname, projectId]);

  return null;
}
