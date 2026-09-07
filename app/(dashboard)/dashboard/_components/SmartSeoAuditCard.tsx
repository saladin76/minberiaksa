"use client";

import { SmartSeoWorkbenchCard } from "./SmartSeoWorkbenchCard";
import type { SupportedLocale } from "@/lib/locales";

type SeoContentType = "campaign" | "category" | "blog";
/**
 * Every publicly routed locale. Derived from the single source of truth rather
 * than listed here, so promoting a locale cannot leave this behind — which is
 * exactly what happened when the Minbar port took the site from 8 to 19.
 */
type LocaleCode = SupportedLocale;

export function SmartSeoAuditCard({
  type,
  locale = "ar",
  title,
  description,
  slug,
  imageCount = 0,
}: {
  type: SeoContentType;
  locale?: LocaleCode;
  title?: string | null;
  description?: string | null;
  slug?: string | null;
  imageCount?: number;
}) {
  return (
    <SmartSeoWorkbenchCard
      type={type}
      locale={locale}
      title={title}
      description={description}
      slug={slug}
      imageCount={imageCount}
    />
  );
}
