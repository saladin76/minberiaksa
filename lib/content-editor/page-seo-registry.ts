import { slugFor, type MinbarRoute } from "../minbar/routes";
export const MANAGED_SEO_PAGES = [
  {
    "key": "home",
    "label": "الصفحة الرئيسية",
    "route": null,
    "namespace": "homepage",
    "titleKeys": [],
    "descriptionKey": "",
    "seoTitle": "seo.title"
  },
  {
    "key": "blog",
    "label": "المدونة",
    "route": "blog",
    "namespace": "cart",
    "titleKeys": [],
    "descriptionKey": "",
    "seoTitle": "seo.blog.title"
  },
  {
    "key": "bankAccounts",
    "label": "الحسابات البنكية",
    "route": "bankAccounts",
    "namespace": "cart",
    "titleKeys": [
      "bankPageTitle"
    ],
    "descriptionKey": "bankPageLead",
    "seoTitle": "t(\"bankPageTitle\")"
  },
  {
    "key": "legacyCampaigns",
    "label": "قائمة المشاريع السابقة",
    "route": null,
    "namespace": "cart",
    "titleKeys": [],
    "descriptionKey": "",
    "seoTitle": "seo.campaigns.title"
  },
  {
    "key": "volunteer",
    "label": "التطوع",
    "route": "volunteer",
    "namespace": "volunteer",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "heroSubtitle",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "zakatCalculator",
    "label": "حاسبة الزكاة",
    "route": "zakatCalculator",
    "namespace": "zakat",
    "titleKeys": [
      "calcTitle"
    ],
    "descriptionKey": "calcLead",
    "seoTitle": "t(\"calcTitle\")"
  },
  {
    "key": "courses",
    "label": "الدورات",
    "route": "courses",
    "namespace": "homepage",
    "titleKeys": [
      "coursesTitle"
    ],
    "descriptionKey": "coursesLead",
    "seoTitle": "t(\"coursesTitle\")"
  },
  {
    "key": "achievementVideos",
    "label": "فيديوهات الإنجازات",
    "route": "achievementVideos",
    "namespace": "homepage",
    "titleKeys": [
      "achVideosPageTitle"
    ],
    "descriptionKey": "achVideosPageLead",
    "seoTitle": "t(\"achVideosPageTitle\")"
  },
  {
    "key": "about",
    "label": "عن المؤسسة",
    "route": "about",
    "namespace": "about",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "heroSubtitle",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "programs",
    "label": "البرامج المصورة",
    "route": "programs",
    "namespace": "common",
    "titleKeys": [
      "programsTitle"
    ],
    "descriptionKey": "programsLead",
    "seoTitle": "t(\"programsTitle\")"
  },
  {
    "key": "zakat",
    "label": "الزكاة",
    "route": "zakat",
    "namespace": "zakat",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "whyText",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "publications",
    "label": "الكتيبات",
    "route": "publications",
    "namespace": "common",
    "titleKeys": [
      "bookletsTitle"
    ],
    "descriptionKey": "bookletsLead",
    "seoTitle": "t(\"bookletsTitle\")"
  },
  {
    "key": "partner",
    "label": "الشراكة",
    "route": "partner",
    "namespace": "partner",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "metaDescription",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "terms",
    "label": "الشروط",
    "route": "terms",
    "namespace": "legal",
    "titleKeys": [
      "termsTitle"
    ],
    "descriptionKey": "termsUsageP",
    "seoTitle": "t(\"termsTitle\")"
  },
  {
    "key": "endorsementVideos",
    "label": "التزكيات",
    "route": "endorsementVideos",
    "namespace": "homepage",
    "titleKeys": [
      "endVideosPageTitle"
    ],
    "descriptionKey": "endVideosPageLead",
    "seoTitle": "t(\"endVideosPageTitle\")"
  },
  {
    "key": "aqsa",
    "label": "المسجد الأقصى",
    "route": "aqsa",
    "namespace": "aqsa",
    "titleKeys": [
      "pageTitle"
    ],
    "descriptionKey": "seoDescription",
    "seoTitle": "t(\"pageTitle\")"
  },
  {
    "key": "jerusalem",
    "label": "القدس",
    "route": "jerusalem",
    "namespace": "jerusalem",
    "titleKeys": [
      "pageTitle"
    ],
    "descriptionKey": "seoDescription",
    "seoTitle": "t(\"pageTitle\")"
  },
  {
    "key": "accessibility",
    "label": "إمكانية الوصول",
    "route": "accessibility",
    "namespace": "legal",
    "titleKeys": [
      "a11yTitle"
    ],
    "descriptionKey": "a11yCommitP",
    "seoTitle": "t(\"a11yTitle\")"
  },
  {
    "key": "recurring",
    "label": "التبرع المتكرر",
    "route": "recurring",
    "namespace": "recurring",
    "titleKeys": [
      "title1",
      "title2"
    ],
    "descriptionKey": "lead",
    "seoTitle": "`${t(\"title1\")} ${t(\"title2\")}`"
  },
  {
    "key": "cookies",
    "label": "ملفات الارتباط",
    "route": "cookies",
    "namespace": "legal",
    "titleKeys": [
      "cookiesTitle"
    ],
    "descriptionKey": "cwWhatP",
    "seoTitle": "t(\"cookiesTitle\")"
  },
  {
    "key": "news",
    "label": "الأخبار",
    "route": "news",
    "namespace": "common",
    "titleKeys": [
      "newsTitle"
    ],
    "descriptionKey": "newsLead",
    "seoTitle": "t(\"newsTitle\")"
  },
  {
    "key": "legacyBankTransfer",
    "label": "التحويل البنكي",
    "route": null,
    "namespace": "cart",
    "titleKeys": [],
    "descriptionKey": "",
    "seoTitle": "seo.title"
  },
  {
    "key": "projects",
    "label": "المشاريع",
    "route": "projects",
    "namespace": "cart",
    "titleKeys": [],
    "descriptionKey": "",
    "seoTitle": "seo.campaigns.title"
  },
  {
    "key": "waqf",
    "label": "الأوقاف",
    "route": "waqf",
    "namespace": "waqf",
    "titleKeys": [
      "qudsWaqfProjects"
    ],
    "descriptionKey": "meterIntro",
    "seoTitle": "t(\"qudsWaqfProjects\")"
  },
  {
    "key": "contact",
    "label": "التواصل",
    "route": "contact",
    "namespace": "contact",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "heroSubtitle",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "privacy",
    "label": "الخصوصية",
    "route": "privacy",
    "namespace": "legal",
    "titleKeys": [
      "privacyTitle"
    ],
    "descriptionKey": "privCollectP",
    "seoTitle": "t(\"privacyTitle\")"
  },
  {
    "key": "donationPolicy",
    "label": "سياسة التبرع",
    "route": "donationPolicy",
    "namespace": "legal",
    "titleKeys": [
      "donationTitle"
    ],
    "descriptionKey": "donTracksP",
    "seoTitle": "t(\"donationTitle\")"
  },
  {
    "key": "reports",
    "label": "الإنجازات والتقارير",
    "route": "reports",
    "namespace": "achievements",
    "titleKeys": [
      "reports.title"
    ],
    "descriptionKey": "hero.lead",
    "seoTitle": "t(\"reports.title\")"
  },
  {
    "key": "zenkiCourse",
    "label": "دورة نور الدين زنكي",
    "route": "zenkiCourse",
    "namespace": "zenki",
    "titleKeys": [
      "heroTitle"
    ],
    "descriptionKey": "heroLead",
    "seoTitle": "t(\"heroTitle\")"
  },
  {
    "key": "restorationProject",
    "label": "ترميم منازل القدس",
    "route": "restorationProject",
    "namespace": "projects",
    "titleKeys": [
      "restHeroTitle"
    ],
    "descriptionKey": "restHeroLead",
    "seoTitle": "t(\"restHeroTitle\")"
  }
] as const;
export function managedSeoPage(key: string) { return MANAGED_SEO_PAGES.find((page) => page.key === key); }
export function managedPagePath(key: string, locale: string) {
  const page = managedSeoPage(key);
  if (!page) return "";
  if (key === "legacyCampaigns") return "/campaigns";
  if (key === "legacyBankTransfer") return "/bank-transfer";
  if (key === "home") return "";
  return "/" + slugFor(page.route as MinbarRoute, locale);
}
export const PAGE_SEO_FIELDS = [
  ["metaTitle", "عنوان البحث"], ["metaDescription", "وصف البحث"], ["seoKeyword", "العبارة الرئيسية المستهدفة"],
  ["ogTitle", "عنوان المشاركة"], ["ogDescription", "وصف المشاركة"], ["ogImage", "صورة المشاركة"], ["imageAlt", "وصف الصورة"],
] as const;
export type PageSeoValues = Record<string, string>;
export type PageSeoLocales = Record<string, PageSeoValues>;
