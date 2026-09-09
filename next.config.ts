import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Every destination here must be a page that still exists. The marketing overview, أداء الحملات
// and التوصيات pages, and the platform-connections overview, الحسابات الإعلانية, Webhooks and
// سجلات المنصات pages, were deleted — so the routes that used to land on them now land on the
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
  ["/dashboard/platform-connections/ad-accounts", "/dashboard/platform-connections/tracking"],
  ["/dashboard/platform-connections/webhooks", "/dashboard/platform-connections/communication"],
  ["/dashboard/platform-connections/logs", "/dashboard/platform-connections/health"],
] as const;

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "motion", "@radix-ui/react-icons", "date-fns", "react-use"],
    optimizeCss: true,
  },
  // next-intl 3.26's plugin writes this alias to `experimental.turbo.resolveAlias`,
  // which Next 16 no longer reads — it moved to this top-level `turbopack` key, and
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
    minimumCacheTTL: 2592000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "minberiaksa.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      { protocol: "https", hostname: "minberiaksa.org" },
      { protocol: "https", hostname: "muslimglobalrelief.org" },
      { protocol: "https", hostname: "example.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "newarab.com" },
      { protocol: "https", hostname: "i0.wp.com" },
      { protocol: "https", hostname: "middleeastmonitor.com" },
      { protocol: "https", hostname: "division.iium.edu.my" },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  devIndicators: { position: "bottom-right" },
  reactStrictMode: true,
  serverExternalPackages: ["@usewaypoint/email-builder"],
  compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false },
  async rewrites() {
    return [
      { source: "/api/admin/subscriptions/chart", destination: "/api/admin/subscriptions/overview/chart" },
      { source: "/api/admin/subscriptions/stats", destination: "/api/admin/subscriptions/overview/stats" },
    ];
  },
  async redirects() {
    return [
      ...marketingRedirects.map(([source, destination]) => ({ source, destination, permanent: false })),
      { source: "/page/biz-kimiz", destination: "/tr/about-us", permanent: true },
      { source: "/page/saglik", destination: "/tr", permanent: true },
      { source: "/page/yardim", destination: "/tr/contact-us", permanent: true },
      { source: "/ar/donates", destination: "/ar/campaigns", permanent: true },
      { source: "/donates", destination: "/en/campaigns", permanent: true },
    ];
  },
};

/* `export default`, not `module.exports`: this file uses ESM `import` at the top,
   so Next loads it as a module and a CJS assignment is not its export. With that
   assignment the next-intl plugin never applied, `i18n/request.ts` was never
   registered, and every `getTranslations()` in a `generateMetadata()` threw
   "Couldn't find next-intl config file" — which Next swallows, so each affected
   page shipped with no <title> and no description at all. */
export default withNextIntl(nextConfig);
