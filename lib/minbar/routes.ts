/**
 * Route map for the Minbar Al-Aqsa site.
 *
 * The handoff pages link to each other by filename (`المشاريع.dc.html`), which
 * has no meaning once the design is running on a router. Every one of those
 * links resolves through this map instead, so a slug change is a single edit
 * rather than a sweep across 55 pages — the same "one dictionary + overrides"
 * rule `Header.dc.html` states for `linkOverrides`.
 *
 * `PRODUCTION_SEO_CONTRACT.md` requires `/{locale}/{localized-slug}` with an
 * independent slug per language. `SLUGS` below holds the canonical (English)
 * slug for every page and `LOCALIZED_SLUGS` holds the per-locale overrides.
 * Locales with no override fall back to the canonical slug, which is a valid
 * intermediate state — it is a live URL under the right locale prefix, so
 * canonical/hreflang stay correct; only the localised wording is outstanding.
 * Adding a translated slug later is an entry here plus a `slugHistory` row and
 * a 301, per the contract's Slug History section.
 */

import type { SupportedLocale } from "@/lib/locales";

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
 * Per-locale slug overrides. Arabic is filled in because it is the source
 * language and `x-default` points at it; the remaining locales inherit the
 * canonical slug until their localisation pass lands.
 */
export const LOCALIZED_SLUGS: Partial<Record<SupportedLocale, Partial<Record<MinbarRoute, string>>>> = {
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

/** Slug for a page in a given locale, falling back to the canonical slug. */
export function slugFor(route: MinbarRoute, locale: string): string {
  return LOCALIZED_SLUGS[locale as SupportedLocale]?.[route] ?? SLUGS[route];
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
