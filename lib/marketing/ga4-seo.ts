import type { Ga4DashboardReport } from "./ga4-reporting";
import type { Ga4Period } from "./ga4-period";
import { MANAGED_SEO_PAGES, managedPagePath } from "../content-editor/page-seo-registry";
import { SUPPORTED_LOCALES } from "../locales";

export function ga4SeoEvidence(report: Ga4DashboardReport, period: Ga4Period, pagePath: string) {
  const normalize = (path: string) => path.split("?")[0].replace(/\/$/, "") || "/";
  return {
    source: "Google Analytics 4", period, pagePath, quality: report.quality,
    pages: report.pages.filter((row) => normalize(row.pagePath) === normalize(pagePath)).map(({pagePath, screenPageViews, activeUsers, sessions}) => ({pagePath, screenPageViews, activeUsers, sessions})),
    landingPages: report.extended?.landingPages?.rows.filter((row) => normalize(row.dimensions[0] ?? "") === normalize(pagePath)),
    organicSearch: report.organicSearch?.status === "ready" ? {timezone: report.organicSearch.timezone, startDate: report.organicSearch.startDate, endDate: report.organicSearch.endDate, queries: report.organicSearch.rows.filter((row) => normalize(row.pagePath) === normalize(pagePath))} : {status: report.organicSearch?.status ?? "unavailable"},
    availability: { landingPages: report.extended?.landingPages?.error ?? "available", note: "Top rows only. Absence of this path is not proof of zero traffic. Organic query metrics come only from Search Console when available. No search-volume estimates or confirmed donation count are supplied." },
  };
}

export function ga4ManagedSeoLink(path: string, period: Ga4Period) {
  const normalized = path.split("?")[0].replace(/\/$/, "");
  for (const locale of SUPPORTED_LOCALES) for (const page of MANAGED_SEO_PAGES) {
    if (normalized === `/${locale}${managedPagePath(page.key, locale)}`) return `/dashboard/seo-pages?${new URLSearchParams({ page: page.key, locale, ga4: "1", ...period })}`;
  }
  return null;
}
