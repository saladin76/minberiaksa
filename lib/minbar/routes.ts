/**
 * Route map for the Minbar Al-Aqsa site.
 *
 * The handoff pages link to each other by filename (`المشاريع.dc.html`), which
 * has no meaning once the design is running on a router. Every one of those
 * links resolves through this map instead, so a slug change is a single edit
 * rather than a sweep across 55 pages — the same "one dictionary + overrides"
 * rule `Header.dc.html` states for `linkOverrides`.
 *
 * Every page lives at `/{locale}/{slug}` with ONE slug for every locale —
 * `/en/checkout`, `/ar/checkout`, `/tr/checkout`. The site once gave Arabic
 * its own spellings (`/ar/بيانات-الدفع`); that made a URL mean something in
 * one locale and nothing in the next, so switching language on such a page
 * landed on a 404, and the hreflang links pointed at URLs that did not exist.
 * One slug per page keeps every locale's URL for a page derivable from any
 * other's, which is what the language switch and hreflang both rely on. The
 * old Arabic spellings live on in `LEGACY_SLUGS` and 301 to the canonical URL,
 * so nothing already indexed or shared goes dark.
 */

import type { SupportedLocale } from "../locales";

/** Every routable page in the handoff. Keys mirror the i18n navigation keys. */
export type MinbarRoute =
  | "home"
  | "projects"
  | "projectDetail"
  | "zakat"
  | "zakatCalculator"
  | "waqf"
  | "recurring"
  | "aqsa"
  | "jerusalem"
  | "reports"
  | "reportDetail"
  | "blog"
  | "article"
  | "news"
  | "programs"
  | "achievementVideos"
  | "endorsementVideos"
  | "publications"
  | "courses"
  | "zenkiCourse"
  | "about"
  | "contact"
  | "volunteer"
  | "partner"
  | "bankAccounts"
  | "cart"
  | "checkout"
  | "account"
  | "donationSuccess"
  | "paymentFailed"
  | "paymentCancelled"
  | "paymentProcessing"
  | "paymentPending"
  | "receipt"
  | "waqfCertificate"
  | "thanksCertificate"
  | "restorationProject"
  | "ibadanProject"
  | "terms"
  | "privacy"
  | "donationPolicy"
  | "cookies"
  | "accessibility"
  | "maintenance";

/** Canonical slug per page, relative to `/{locale}`. */
export const SLUGS: Record<MinbarRoute, string> = {
  home: "",
  projects: "projects",
  projectDetail: "projects",
  zakat: "zakat",
  zakatCalculator: "zakat-calculator",
  waqf: "waqf",
  recurring: "recurring-donation",
  aqsa: "al-aqsa-mosque",
  jerusalem: "al-quds-and-the-old-city",
  reports: "achievements-and-reports",
  reportDetail: "achievements-and-reports",
  blog: "blog",
  article: "blog",
  news: "news",
  programs: "video-programmes",
  achievementVideos: "achievements-in-video",
  endorsementVideos: "endorsements-in-video",
  publications: "publications",
  courses: "courses",
  zenkiCourse: "courses/nur-ad-din-zengi",
  about: "about-us",
  contact: "contact-us",
  volunteer: "volunteer",
  partner: "become-a-partner",
  bankAccounts: "bank-accounts",
  cart: "cart",
  checkout: "checkout",
  account: "account",
  /* The payment gateways redirect straight to `/{locale}/success/{donationId}`
     (`app/api/payfor/3dpay/ok`, `app/api/albaraka/3d/callback`), so the success
     page lives at that path rather than at the handoff's own slug. Renaming it
     would break every in-flight payment the moment it shipped. */
  donationSuccess: "success",
  paymentFailed: "payment-failed",
  paymentCancelled: "payment-cancelled",
  paymentProcessing: "payment-processing",
  paymentPending: "payment-pending",
  receipt: "receipt",
  waqfCertificate: "certificates/waqf",
  thanksCertificate: "certificates/thanks",
  restorationProject: "projects/al-quds-home-restoration",
  ibadanProject: "projects/ibadan-lana",
  terms: "terms",
  privacy: "privacy",
  donationPolicy: "donation-policy",
  cookies: "cookie-policy",
  accessibility: "accessibility",
  maintenance: "maintenance",
};

/**
 * Slugs a page USED to have, per the locale that had them. Nothing links to
 * them any more; the middleware 301s a request for one — under ANY locale
 * prefix, because the language switch swaps only the prefix — to the page's
 * canonical slug. Keep an entry for as long as its URL might still be indexed
 * or in someone's hands; removing one turns that URL into a 404.
 */
export const LEGACY_SLUGS: Partial<Record<SupportedLocale, Partial<Record<MinbarRoute, string>>>> = {
  ar: {
    projects: "المشاريع",
    projectDetail: "المشاريع",
    zakat: "الزكاة",
    zakatCalculator: "حاسبة-الزكاة",
    waqf: "الأوقاف",
    recurring: "التبرع-الدوري",
    aqsa: "المسجد-الأقصى",
    jerusalem: "القدس-والبلدة-القديمة",
    reports: "إنجازات-وتقارير-المؤسسة",
    reportDetail: "إنجازات-وتقارير-المؤسسة",
    blog: "المدونة",
    article: "المدونة",
    news: "الأخبار",
    programs: "برامجنا-المصورة",
    achievementVideos: "إنجازاتنا-بالفيديو",
    endorsementVideos: "تزكياتنا-بالفيديو",
    publications: "كتيبات-المؤسسة",
    courses: "دوراتنا",
    zenkiCourse: "دوراتنا/دورة-نور-الدين-زنكي",
    about: "من-نحن",
    contact: "تواصل-معنا",
    volunteer: "تطوع-معنا",
    partner: "كن-شريكا",
    bankAccounts: "الحسابات-البنكية",
    cart: "السلة",
    checkout: "بيانات-الدفع",
    account: "حساب-المتبرع",
  },
};

/**
 * Pages that must never be indexed (`PRODUCTION_SEO_CONTRACT.md` § Indexing
 * rules): the donor's own account, the cart, and every payment / receipt /
 * certificate surface, all of which are per-donor and often reachable by id.
 */
export const NOINDEX_ROUTES: ReadonlySet<MinbarRoute> = new Set<MinbarRoute>([
  "account",
  "cart",
  "checkout",
  "donationSuccess",
  "paymentFailed",
  "paymentCancelled",
  "paymentProcessing",
  "paymentPending",
  "receipt",
  "waqfCertificate",
  "thanksCertificate",
  "maintenance",
]);

/**
 * Pages that carry the floating quick-donation pill (`QuickDonate`).
 *
 * A central allowlist, not a growing blacklist (`DEPLOYED_VS_DESIGN_AUDIT.md`
 * § P2.1). The approved design gives the homepage its own quick-donation card
 * and removes the pill from the pages that already hold a donation module —
 * projects, zakat, waqf, recurring — and from the blog; the transactional
 * surfaces (cart, checkout, payment states, documents, account) never had it.
 * What is left is the reading pages, where a visitor moved to give has no
 * donation control in reach.
 */
export const QUICK_DONATE_ROUTES: ReadonlySet<MinbarRoute> = new Set<MinbarRoute>([
  "aqsa",
  "jerusalem",
  "reports",
  "reportDetail",
  "news",
  "programs",
  "achievementVideos",
  "endorsementVideos",
  "publications",
  "courses",
  "zenkiCourse",
  "about",
  "contact",
  "volunteer",
  "partner",
]);

/**
 * The page a pathname belongs to, or `null` for one outside the map (a
 * dashboard or API path, a category page, a 404). The longest matching slug
 * wins, so `/projects/x` is `projectDetail` and `/projects` is `projects`.
 * Locale slugs are tried for the pathname's own locale before the canonical
 * ones — a locale may give a page its own slug (`slugFor`).
 */
export function routeForPathname(pathname: string): MinbarRoute | null {
  const match = /^\/([a-z]{2})(?:\/(.*))?$/.exec(pathname.replace(/\/+$/, "") || "/");
  if (!match) return null;
  const locale = match[1];
  const rest = match[2] ?? "";
  if (rest === "") return "home";

  /* A list page and its detail page share a slug; the child segment decides. */
  const DETAIL_OF: Partial<Record<MinbarRoute, MinbarRoute>> = { projects: "projectDetail", blog: "article", reports: "reportDetail" };
  const DETAIL_ROUTES = new Set<MinbarRoute>(Object.values(DETAIL_OF) as MinbarRoute[]);

  let best: { route: MinbarRoute; length: number } | null = null;
  for (const route of Object.keys(SLUGS) as MinbarRoute[]) {
    if (DETAIL_ROUTES.has(route)) continue;
    for (const slug of new Set([SLUGS[route], slugFor(route, locale)])) {
      if (!slug) continue;
      const exact = rest === slug;
      const child = rest.startsWith(`${slug}/`);
      if (!exact && !child) continue;
      const resolved = child && DETAIL_OF[route] ? DETAIL_OF[route]! : route;
      if (!best || slug.length > best.length) best = { route: resolved, length: slug.length };
    }
  }
  return best?.route ?? null;
}

/**
 * Slug for a page — the same in every locale. `locale` is still accepted so
 * the call sites keep reading as "this page, in this locale", which is what
 * they mean, and so nothing has to change if a locale ever needs its own.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function slugFor(route: MinbarRoute, locale: string): string {
  return SLUGS[route];
}

/**
 * Absolute in-app path for a page.
 *
 * @param extra Extra path segments appended after the page slug — a project or
 *              article slug for the detail routes.
 */
export function miaPath(route: MinbarRoute, locale: string, ...extra: string[]): string {
  const slug = slugFor(route, locale);
  const parts = [locale, slug, ...extra].filter((part) => part !== "" && part != null);
  return `/${parts.join("/")}`;
}
