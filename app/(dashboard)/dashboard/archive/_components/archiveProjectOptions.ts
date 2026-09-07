"use client";

import { useEffect, useMemo, useState } from "react";

export type ArchiveProjectOptions = {
  years: string[];
  countries: string[];
  cities: string[];
  themes: string[];
  projectTypes: string[];
};

export const ARCHIVE_PROJECT_OPTIONS_EVENT = "archive-project-options-updated";
export const ARCHIVE_PROJECT_OPTIONS_STORAGE_KEY = "gozbebekleri.archive.project-options";
export const ARCHIVE_PROJECT_OPTIONS_API = "/api/admin/archive/project-options";

export const DEFAULT_ARCHIVE_PROJECT_OPTIONS: ArchiveProjectOptions = {
  years: Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)),
  countries: ["فلسطين", "السودان", "سوريا", "تركيا", "اليمن", "لبنان", "عام"],
  cities: ["غزة", "القدس", "الخرطوم", "إدلب", "إسطنبول", "صنعاء", "عام"],
  themes: ["مياه", "طرود", "إفطار", "كفالات", "زكاة", "وقف", "تعليم", "صحة", "إيواء", "أضاحي"],
  projectTypes: ["إغاثة طارئة", "مشروع موسمي", "مشروع دائم", "توثيق ميداني", "حملة تسويقية", "ملف رسمي"],
};

export function useArchiveProjectOptions(defaultYear?: number) {
  const [options, setOptions] = useState<ArchiveProjectOptions>(() => withDefaultYear(readArchiveProjectOptions(), defaultYear));

  useEffect(() => {
    let cancelled = false;

    function refreshLocal() {
      setOptions(withDefaultYear(readArchiveProjectOptions(), defaultYear));
    }

    async function refreshShared() {
      try {
        const response = await fetch(ARCHIVE_PROJECT_OPTIONS_API, { cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok || !result?.options || cancelled) return;
        const next = normalizeOptions(result.options);
        writeLocalOptions(next);
        setOptions(withDefaultYear(next, defaultYear));
      } catch {
        refreshLocal();
      }
    }

    refreshLocal();
    void refreshShared();
    window.addEventListener(ARCHIVE_PROJECT_OPTIONS_EVENT, refreshLocal);
    window.addEventListener("storage", refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener(ARCHIVE_PROJECT_OPTIONS_EVENT, refreshLocal);
      window.removeEventListener("storage", refreshLocal);
    };
  }, [defaultYear]);

  return useMemo(() => withDefaultYear(options, defaultYear), [defaultYear, options]);
}

export function readArchiveProjectOptions(): ArchiveProjectOptions {
  if (typeof window === "undefined") return DEFAULT_ARCHIVE_PROJECT_OPTIONS;

  try {
    const raw = window.localStorage.getItem(ARCHIVE_PROJECT_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_ARCHIVE_PROJECT_OPTIONS;
    return normalizeOptions(JSON.parse(raw));
  } catch {
    return DEFAULT_ARCHIVE_PROJECT_OPTIONS;
  }
}

export async function saveArchiveProjectOptions(options: ArchiveProjectOptions) {
  const normalized = normalizeOptions(options);
  if (typeof window !== "undefined") {
    writeLocalOptions(normalized);
    window.dispatchEvent(new Event(ARCHIVE_PROJECT_OPTIONS_EVENT));
  }

  const response = await fetch(ARCHIVE_PROJECT_OPTIONS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || result?.message || "تعذر حفظ خيارات الأرشيف");
  }

  const saved = normalizeOptions(result.options ?? normalized);
  if (typeof window !== "undefined") {
    writeLocalOptions(saved);
    window.dispatchEvent(new Event(ARCHIVE_PROJECT_OPTIONS_EVENT));
  }
  return saved;
}

export function withSelectedOption(options: string[], selected?: string | null) {
  return unique([selected ?? "", ...options]);
}

function writeLocalOptions(options: ArchiveProjectOptions) {
  window.localStorage.setItem(ARCHIVE_PROJECT_OPTIONS_STORAGE_KEY, JSON.stringify(normalizeOptions(options)));
}

function withDefaultYear(options: ArchiveProjectOptions, defaultYear?: number): ArchiveProjectOptions {
  const year = defaultYear ? String(defaultYear) : "";
  return normalizeOptions({ ...options, years: unique([year, ...options.years]) });
}

function normalizeOptions(value: Partial<ArchiveProjectOptions> | unknown): ArchiveProjectOptions {
  const source = typeof value === "object" && value ? value as Partial<ArchiveProjectOptions> : {};
  return {
    years: sortYears(unique([...(source.years ?? []), ...DEFAULT_ARCHIVE_PROJECT_OPTIONS.years])),
    countries: unique([...(source.countries ?? []), ...DEFAULT_ARCHIVE_PROJECT_OPTIONS.countries]),
    cities: unique([...(source.cities ?? []), ...DEFAULT_ARCHIVE_PROJECT_OPTIONS.cities]),
    themes: unique([...(source.themes ?? []), ...DEFAULT_ARCHIVE_PROJECT_OPTIONS.themes]),
    projectTypes: unique([...(source.projectTypes ?? []), ...DEFAULT_ARCHIVE_PROJECT_OPTIONS.projectTypes]),
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sortYears(values: string[]) {
  return values.slice().sort((a, b) => Number(b) - Number(a));
}
