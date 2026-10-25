import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Every destination here must be a page that still exists. The marketing overview, أداء الحملات
// and التوصيات pages, and the platform-connections overview, الحسابات الإعلانية, Webhooks and
// سجلات المنصات pages, were deleted  so the routes that used to land on them now land on the
// surviving page that covers the same ground (attribution/tracking for marketing, tracking/health
// for platform connections). The deleted routes themselves are redirected too, at the bottom.
const marketingRedirects = [
  ["/dashboard/marketing/ai-assistant", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/campaign-links", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/campaign-links/:id", "/dashboard/marketing/attribution?linkId=:id"],
  ["/dashboard/marketing/campaign-operating-center", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/command-center", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/connections", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing/connections/catalog", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing/connections/health", "/dashboard/platform-connections/health"],
  ["/dashboard/marketing/data-sync", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing/google-ads", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/insights", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/quality", "/dashboard/marketing/tracking"],
  ["/dashboard/marketing/results", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/sync-log", "/dashboard/platform-connections/health"],
  ["/dashboard/marketing/tracking-hub", "/dashboard/marketing/tracking"],
  ["/dashboard/marketing-intelligence", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/action-items", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/ads-recommendations", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/attribution-verification", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/audit", "/dashboard/marketing/tracking"],
  ["/dashboard/marketing-intelligence/budget-decisions", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/budget-recommendations", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/campaign-links", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/campaign-links/health", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/conversion-value-audit", "/dashboard/marketing/tracking"],
  ["/dashboard/marketing-intelligence/data", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/decisions", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/executive-overview", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/final-readiness", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/launch-readiness", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/meta-sync", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing-intelligence/platform-metrics", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/platform-metrics/import", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing-intelligence/platform-status", "/dashboard/platform-connections/health"],
  ["/dashboard/marketing-intelligence/platform-sync", "/dashboard/platform-connections/tracking"],
  ["/dashboard/marketing-intelligence/repair-center", "/dashboard/marketing/tracking"],
  ["/dashboard/marketing-intelligence/site-vs-platform", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/system-map", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing-intelligence/test-checklist", "/dashboard/marketing/tracking"],
  ["/dashboard/link-generator", "/dashboard/marketing/attribution#builder"],
  ["/dashboard/conversion-events", "/dashboard/marketing/tracking"],
  ["/dashboard/conversion-events/timeline", "/dashboard/marketing/tracking"],
  ["/dashboard/conversion-events/retry-truth", "/dashboard/marketing/tracking"],
  // Removed pages. Bookmarks and old deep links land on the nearest surviving page instead of 404.
  // The campaign detail screen is gone: a campaign now opens its channel report
  // directly. The channel is not in the URL, so this lands on the list, where the
  // row links through with the right channel.
  // The `(?!new$)` guard matters: redirects are evaluated before filesystem
  // routing, so a bare `:id` would also swallow `/campaigns/new` and make it
  // impossible to create a campaign.
  ["/dashboard/communication/campaigns/:id((?!new$)[^/]+)", "/dashboard/communication/campaigns"],
  ["/dashboard/messages", "/dashboard/inbox"],
  ["/dashboard/marketing", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/performance", "/dashboard/marketing/attribution"],
  ["/dashboard/marketing/recommendations", "/dashboard/marketing/attribution"],
  ["/dashboard/platform-connections", "/dashboard/platform-connections/tracking"],
  ["/dashboard/pixels", "/dashboard/platform-connections/tracking"],
  ["/dashboard/platform-connections/ad-accounts", "/dashboard/platform-connections/tracking"],
  ["/dashboard/platform-connections/webhooks", "/dashboard/platform-connections/communication"],
  ["/dashboard/platform-connections/logs", "/dashboard/platform-connections/health"],
] as const;

/* توحيد تصنيفات المدونة (29 → 16): حزم المقالات 179–258 جاءت بتصنيفات canonical
   مختلفة عن تصنيفات الـ178 الأصلية، فتراكمت أزواج تعني الشيء ذاته («التعليم» و«التعليم
   والطفولة»، «رمضان» و«رمضان والمواسم»، …). دُمجت في scripts/merge-blog-categories.ts،
   والـslugs المحذوفة تُعاد توجيهًا دائمًا إلى وجهتها كي لا تسقط صفحة تصنيف مفهرسة في 404.
   «المياه-والصحة» كان خليط مياه وطب فقُسِّم على تصنيفين؛ فيذهب إلى وجهة الأغلبية. */
const blogCategoryRedirects = [
  ["المياه-والصحة", "المياه-والصرف-الصحي"],
  ["ذو-الحجة-والأضاحي", "الحج-والأضاحي"],
  ["الثقة-والشفافية-والعمل-المؤسسي", "الثقة-والشفافية"],
  ["القرآن-والعبادات", "إيمانيات-وتزكية"],
  ["رمضان", "رمضان-والمواسم"],
  ["إيمانيات-وأسرة", "إيمانيات-وتزكية"],
  ["التعليم", "التعليم-والطفولة"],
  ["سبل-العيش-والاستدامة", "سبل-العيش-والبيئة"],
  ["غزة-والإغاثة-والطوارئ", "الإغاثة-والطوارئ"],
  ["التمكين-وسبل-العيش", "سبل-العيش-والبيئة"],
  ["الأمن-الغذائي-وسبل-العيش", "سبل-العيش-والبيئة"],
  ["البيئة-والمناخ", "سبل-العيش-والبيئة"],
  ["الأيتام-وحماية-الطفل", "الأيتام-والتكافل"],
] as const;

/* Mirrors `isProductionDeployment()` in lib/seo.ts (this file cannot use the
   `@/` alias): Vercel production, or any production build off Vercel (the VPS)
   unless SITE_INDEXING=off. Keying on VERCEL_ENV alone sent `noindex` from the
   VPS, which has no Vercel variables. */
function isIndexableDeployment(): boolean {
  if (process.env.SITE_INDEXING === "off") return false;
  if (process.env.VERCEL) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

/* About 120 days: long enough for Lighthouse's cache audit to treat it as
   efficient, short enough that an image replaced in place still turns over. */
const ASSET_CACHE = { key: "Cache-Control", value: "public, max-age=10368000, stale-while-revalidate=86400" };
const IMMUTABLE_CACHE = { key: "Cache-Control", value: "public, max-age=31536000, immutable" };

/* Baseline hardening. No script-src CSP: GTM, Clarity, Contentsquare, Meta,
   TikTok, Stripe and PayPal would all need allow-listing first. COOP keeps
   popups allowed for the PayPal and Google sign-in windows. */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  /* `scripts/deploy-vps.sh` builds into a separate folder (NEXT_DIST_DIR) while
     the live server keeps reading `.next`, then swaps the two. Building over the
     `.next` a running server reads left it serving half of each build: missing
     Prisma modules, "client reference manifest does not exist", no 500 page. */
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "motion", "@radix-ui/react-icons", "date-fns", "react-use"],
    optimizeCss: true,
  },
  // next-intl 3.26's plugin writes this alias to `experimental.turbo.resolveAlias`,
  // which Next 16 no longer reads  it moved to this top-level `turbopack` key, and
  // logs the old one as an unrecognized experimental option. Without the alias
  // `next-intl/config` never resolves, so every `getTranslations()` on the server
  // threw "Couldn't find next-intl config file". Next swallows that inside
  // `generateMetadata()`, which left every page using it with no <title> and no
  // description at all. Remove this once next-intl is upgraded to a Next 16 build.
  turbopack: {
    resolveAlias: { "next-intl/config": "./i18n/request.ts" },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // ~120 days, matching ASSET_CACHE: 30 days still counts as a short cache lifetime in Lighthouse.
    minimumCacheTTL: 10368000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },     
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "minberiaksa.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      { protocol: "https", hostname: "muslimglobalrelief.org" },
      { protocol: "https", hostname: "example.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "newarab.com" },
      { protocol: "https", hostname: "i0.wp.com" },
      { protocol: "https", hostname: "middleeastmonitor.com" },
      { protocol: "https", hostname: "division.iium.edu.my" },
    ],
  },
  /* `eslint: { ignoreDuringBuilds }` used to live here. Next 16 removed the built-in lint step
     entirely  the key is not even part of `NextConfig` any more, so it silenced nothing and was
     itself a type error. Linting is a CI gate of its own now (`npm run lint`, .github/workflows). */
  /* Type errors fail the build. This was `true` while the repo carried 163 of them; it now carries
     none (see `npm run typecheck:baseline`, whose baseline file is empty), so a new error is a broken
     build rather than a warning nobody reads. */
  typescript: {
    ignoreBuildErrors: false,
    // The side-build checks against its own route types only (tsconfig.deploy.json).
    ...(process.env.NEXT_DIST_DIR ? { tsconfigPath: "tsconfig.deploy.json" } : {}),
  },
  devIndicators: { position: "bottom-right" },
  reactStrictMode: true,
  serverExternalPackages: ["@usewaypoint/email-builder"],
  /* Donation PDFs use @sparticuz/chromium-min + a remote browser pack.
     The large browser archive is therefore absent from serverless outputs. */
  compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false },
  /* Preview and development deployments carry production canonicals and
     hreflang, which does not stop a crawler indexing the preview URL itself.
     Off production, every response says so in a header  one place, not a
     per-page flag (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.1). `app/robots.ts`
     and the root layout's metadata say the same for the crawlers that read
     those instead. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...(isIndexableDeployment() ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
          ...SECURITY_HEADERS,
        ],
      },
      /* `/public` files are served with `max-age=0` by default, so every visit
         re-downloaded the logo, the pattern tile and every font. Fonts and the
         hero stills are named per version and never change in place; the other
         images change rarely, and a replaced one should get a new file name. */
      { source: "/fonts/:path*", headers: [IMMUTABLE_CACHE] },
      { source: "/minbar/assets/hero/:path*", headers: [IMMUTABLE_CACHE] },
      { source: "/minbar/assets/:path*", headers: [ASSET_CACHE] },
      { source: "/assets/:path*", headers: [ASSET_CACHE] },
      { source: "/:file(.+\\.(?:png|jpe?g|webp|avif|svg|ico))", headers: [ASSET_CACHE] },
    ];
  },
  async rewrites() {
    return [
      /* Large, immutable public PDFs live in the pinned Git commit CDN rather than
         every Vercel build output. Public URLs stay unchanged for users, database
         rows and search engines while previews no longer upload ~90 MB each time. */
      { source: "/minbar/reports/:path*", destination: "https://cdn.jsdelivr.net/gh/saladin76/minberiaksa@c58f7414e55f964462a37aa0979ba5723311ed2b/public/minbar/reports/:path*" },
      { source: "/minbar/assets/books/isharat-altanzil.pdf", destination: "https://cdn.jsdelivr.net/gh/saladin76/minberiaksa@c58f7414e55f964462a37aa0979ba5723311ed2b/public/minbar/assets/books/isharat-altanzil.pdf" },
      { source: "/api/admin/subscriptions/chart", destination: "/api/admin/subscriptions/overview/chart" },
      { source: "/api/admin/subscriptions/stats", destination: "/api/admin/subscriptions/overview/stats" },
    ];
  },
  async redirects() {
    return [
      /* One host. `www` served the same pages as the bare domain, so every page
         existed twice for crawlers; canonicals name the bare domain (lib/seo.ts). */
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.minberiaksa.org" }],
        destination: "https://minberiaksa.org/:path*",
        permanent: true,
      },
      ...marketingRedirects.map(([source, destination]) => ({ source, destination, permanent: false })),
      ...blogCategoryRedirects.map(([from, to]) => ({
        source: `/:locale/blog/category/${from}`,
        destination: `/:locale/blog/category/${to}`,
        permanent: true,
      })),
      { source: "/page/biz-kimiz", destination: "/tr/about-us", permanent: true },
      { source: "/page/saglik", destination: "/tr", permanent: true },
      { source: "/page/yardim", destination: "/tr/contact-us", permanent: true },
      { source: "/ar/mshrwa-twrya-alkhbr-wdam-almkhabr", destination: "/ar/bagislar/gaza-bread", permanent: true },
      { source: "/ar/donates", destination: "/ar/campaigns", permanent: true },
      { source: "/donates", destination: "/en/campaigns", permanent: true },
    ];
  },
};

/* next-intl 3.x still injects the old `experimental.turbo` alias. Next 16 reads the
   top-level `turbopack` alias above and warns about the legacy key on every build.
   Keep the plugin for i18n registration, then remove only that obsolete duplicate. */
const configured = withNextIntl(nextConfig) as NextConfig & {
  experimental?: NextConfig["experimental"] & { turbo?: unknown };
};
if (configured.experimental && "turbo" in configured.experimental) {
  delete configured.experimental.turbo;
}

export default configured;
