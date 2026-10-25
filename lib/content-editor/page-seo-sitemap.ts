import { SUPPORTED_LOCALES } from "../locales";
import { managedPagePath, managedSeoPage, type PageSeoLocales } from "./page-seo-registry";
export function filterManagedPageSitemap<T extends { loc: string; alternates: Record<string, string> }>(
  entries: T[], rows: { key: string; overrides: unknown }[], siteUrl: string,
): T[] {
  const hidden = new Set<string>();
  for (const row of rows) {
    if (!managedSeoPage(row.key)) continue;
    const overrides = row.overrides as PageSeoLocales;
    for (const locale of SUPPORTED_LOCALES) if (overrides?.[locale]?.seoNoIndex === "true")
      hidden.add(siteUrl + "/" + locale + managedPagePath(row.key, locale));
  }
  return entries.filter((entry) => !hidden.has(entry.loc)).map((entry) => {
    const alternates = Object.fromEntries(Object.entries(entry.alternates).filter(([, url]) => !hidden.has(url)));
    if (!alternates["x-default"]) {
      const fallback = alternates.ar || alternates.en || Object.values(alternates)[0];
      if (fallback) alternates["x-default"] = fallback;
    }
    return { ...entry, alternates };
  });
}

export function filterPageSeoLanguages(languages: Record<string, string>, overrides: PageSeoLocales) {
  const hidden = new Set(Object.entries(overrides).filter(([, value]) => value.seoNoIndex === "true").map(([locale]) => languages[locale]).filter(Boolean));
  const allowed = Object.fromEntries(Object.entries(languages).filter(([, url]) => !hidden.has(url)));
  if (!allowed["x-default"]) { const fallback = allowed.ar || allowed.en || Object.values(allowed)[0]; if (fallback) allowed["x-default"] = fallback; }
  return allowed;
}
