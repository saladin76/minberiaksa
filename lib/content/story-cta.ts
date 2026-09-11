/**
 * Story slide call-to-action: what the dashboard stores, and how the public
 * API turns it into an href for one visitor.
 *
 * A CTA is stored as a KIND and a VALUE, never a finished link. The link
 * depends on who is looking: a campaign has a different slug per locale, a
 * page has a localised path, and a site-relative URL needs the visitor's
 * locale in front of it. Resolving at request time means an editor picks
 * "the zakat page" once and every language edition gets its own correct URL.
 *
 * Currency needs nothing here — it lives in a cookie independent of the path,
 * so any in-app navigation keeps it (`hooks/useMinbarMoney.ts`).
 *
 * Shared by the API (server) and the dashboard form (client); it must stay
 * free of Prisma and Node imports.
 */

import { SLUGS, miaPath, type MinbarRoute } from "@/lib/minbar/routes";

export const STORY_CTA_KINDS = ["PAGE", "CAMPAIGN", "POST", "URL"] as const;
export type StoryCtaKindValue = (typeof STORY_CTA_KINDS)[number];

export function isStoryCtaKind(v: unknown): v is StoryCtaKindValue {
  return typeof v === "string" && (STORY_CTA_KINDS as readonly string[]).includes(v);
}

/**
 * Pages an editor may point a story at, with their Arabic labels.
 *
 * A curated subset of `MinbarRoute` rather than every key: checkout, receipts,
 * certificates and the payment-result screens are steps in a flow, not
 * destinations, and offering them would only produce broken journeys.
 */
export const STORY_PAGE_TARGETS: ReadonlyArray<{ key: MinbarRoute; label: string }> = [
  { key: "home", label: "الرئيسية" },
  { key: "projects", label: "المشاريع" },
  { key: "zakat", label: "الزكاة" },
  { key: "zakatCalculator", label: "حاسبة الزكاة" },
  { key: "waqf", label: "الأوقاف" },
  { key: "recurring", label: "التبرع الدوري" },
  { key: "aqsa", label: "المسجد الأقصى" },
  { key: "jerusalem", label: "القدس والبلدة القديمة" },
  { key: "reports", label: "الإنجازات والتقارير" },
  { key: "blog", label: "المدونة" },
  { key: "news", label: "الأخبار" },
  { key: "programs", label: "برامجنا المصورة" },
  { key: "achievementVideos", label: "فيديوهات الإنجازات" },
  { key: "endorsementVideos", label: "فيديوهات التزكيات" },
  { key: "publications", label: "كتيبات المؤسسة" },
  { key: "courses", label: "دوراتنا" },
  { key: "zenkiCourse", label: "دورة نور الدين زنكي" },
  { key: "about", label: "من نحن" },
  { key: "contact", label: "تواصل معنا" },
  { key: "volunteer", label: "تطوع معنا" },
  { key: "partner", label: "كن شريكًا" },
  { key: "bankAccounts", label: "الحسابات البنكية" },
  { key: "restorationProject", label: "مشروع الترميم" },
  { key: "ibadanProject", label: "مشروع عبادًا لنا" },
];

const PAGE_KEYS = new Set<string>(STORY_PAGE_TARGETS.map((p) => p.key));

export function isStoryPageTarget(v: unknown): v is MinbarRoute {
  return typeof v === "string" && PAGE_KEYS.has(v) && v in SLUGS;
}

export interface StoryCta {
  kind: StoryCtaKindValue;
  value: string;
}

/** Slug lookups the resolver needs for CAMPAIGN and POST — built per request. */
export interface StoryCtaLookups {
  campaignSlugById: ReadonlyMap<string, string>;
  postSlugById: ReadonlyMap<string, string>;
}

/**
 * The href for one visitor, or null when the target no longer resolves — a
 * deleted campaign, an unknown page key. Null hides the button rather than
 * sending someone to a 404.
 */
export function resolveStoryCta(cta: StoryCta | null, locale: string, lookups: StoryCtaLookups): string | null {
  if (!cta || !cta.value) return null;
  switch (cta.kind) {
    case "PAGE":
      return isStoryPageTarget(cta.value) ? miaPath(cta.value, locale) : null;
    case "CAMPAIGN": {
      const slug = lookups.campaignSlugById.get(cta.value);
      return slug ? miaPath("projectDetail", locale, slug) : null;
    }
    case "POST": {
      const slug = lookups.postSlugById.get(cta.value);
      return slug ? `${miaPath("blog", locale)}/${encodeURIComponent(slug)}` : null;
    }
    case "URL":
      return localiseUrl(cta.value, locale);
  }
}

/**
 * A site-relative href gets the locale in front of it, and when its first
 * segment is one of the site's canonical page slugs it is routed through
 * `miaPath` so the LOCALISED slug is used: "/projects#gaza" becomes
 * "/ar/المشاريع#gaza" for an Arabic visitor and "/fr/projects#gaza" for a
 * French one, anchor intact. A path that already carries a locale, or anything
 * absolute, is left alone. This is what the old `linkUrl` field could never do.
 */
export function localiseUrl(href: string, locale: string): string {
  const s = href.trim();
  if (!s) return s;
  if (/^(?:[a-z]+:)?\/\//i.test(s) || s.startsWith("#") || s.startsWith("mailto:") || s.startsWith("tel:")) return s;
  if (!s.startsWith("/")) return s;

  const tailStart = s.search(/[?#]/);
  const path = tailStart < 0 ? s : s.slice(0, tailStart);
  const tail = tailStart < 0 ? "" : s.slice(tailStart);
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(first)) return s;

  /* First segment names a page by its canonical slug: rebuild through the
     route map so each locale gets its own slug, then re-attach the rest. */
  const route = (Object.keys(SLUGS) as MinbarRoute[]).find((r) => SLUGS[r] === first && first !== "");
  if (route) return miaPath(route, locale, ...segments.slice(1)) + tail;

  return `/${locale}${s}`;
}
