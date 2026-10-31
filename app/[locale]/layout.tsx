import { notFound } from "next/navigation";
import { preload } from "react-dom";
import type { Metadata } from "next";
import { LOCALES, LOCALE_SEO, OG_LOCALE_MAP, OG_IMAGE, SITE_URL, buildHreflang, isVercelDeployment } from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import Header from "@/components/minbar/shell/Header";
import MobileBottomNav from "@/components/minbar/shell/MobileBottomNav";
import MinbarFooter from "@/components/minbar/shell/Footer";
import ConciergeLauncher from "@/components/minbar/concierge/ConciergeLauncher";
import CartReminder from "@/components/CartReminder";
import { CurrencyFromUrlSync } from "@/components/CurrencyFromUrlSync";
import IntlProviderClient from "./IntlProviderClient";
import { SUPPORTED_LOCALES, localeDirection } from "@/lib/locales";
import { LEGACY_NAMESPACES, SHELL_NAMESPACES, pickNamespaces } from "@/i18n/locale-messages";
import { Toaster } from "react-hot-toast";
import SessionProvider from "@/components/providers/SessionProvider";
import { ConfettiProvider } from "../../components/providers/confetti-provider";
import PreferredLangSync from "@/components/PreferredLangSync";
import SyncHtmlDir from "@/components/SyncHtmlDir";
import ScrollToTop from "@/components/minbar/ScrollToTop";
import { MarketingRuntime } from "@/components/MarketingRuntime";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listCategories, type NavCategory } from "@/lib/minbar/categories";
import { listNavSuperCategories } from "@/lib/minbar/super-category";
import "@/styles/minbar/minbar.css";
import "@/styles/minbar/locale-fonts.css";
import { LOCALE_FONT_STYLESHEETS } from "@/lib/locale-fonts";

// Valid public locales derive from the single source of truth (enabled set).
const VALID_LOCALES = SUPPORTED_LOCALES;

/* Fetched from the first bytes of the document rather than once the CSS has
   been parsed. The pattern tile is the hero's (and the header's) background,
   which PageSpeed picks as the Largest Contentful Paint element; the text face
   arriving late re-flowed the hero (CLS "web font loaded"). Font file names are
   from `styles/self-hosted-fonts.css`, written by scripts/vendor-google-fonts.mjs
   update them together. */
const PATTERN_TILE = "/minbar/assets/patterns/aqsa-white-pattern.webp";
const RTL_TEXT_FONTS = ["/fonts/cairo/cairo-200-1000-arabic-714d40cf.woff2", "/fonts/cairo/cairo-200-1000-latin-caa2f572.woff2"];
const LTR_TEXT_FONTS = ["/fonts/poppins/poppins-400-latin-ac6d71b4.woff2"];

/** The non-Latin faces `styles/minbar/locale-fonts.css` names, one per locale that needs one. */

/**
 * A first path segment that is not a locale is NOT a page in Arabic.
 *
 * This segment used to fall back to `ar` silently, so every stray root request 
 * `/favicon.ico`, `/apple-touch-icon.png`, a mistyped path, a crawler probing
 * `/wp-admin`  rendered the Arabic homepage with `locale = "favicon.ico"`
 * threaded through it. Anything that then handed that string to `Intl` threw
 * `RangeError: Incorrect locale information provided`, which is how a missing
 * favicon became a 500 in production rather than a 404.
 *
 * A real `app/favicon.ico` now answers that particular request, but the rule is
 * the fix: an unknown locale is a 404, and `notFound()` says so.
 */
function assertLocale(rawLocale: string): Locale {
  if (!VALID_LOCALES.includes(rawLocale as (typeof VALID_LOCALES)[number])) notFound();
  return rawLocale as Locale;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = assertLocale(rawLocale);
  const seo = LOCALE_SEO[locale];
  const alternates = buildHreflang("/", locale);

  return {
    title: { default: seo.title, template: seo.titleTemplate },
    description: seo.description,
    keywords: seo.keywords,
    alternates,
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${SITE_URL}/${locale}`,
      siteName: seo.siteName,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: seo.siteName }],
      locale: OG_LOCALE_MAP[locale],
      alternateLocale: LOCALES.filter((candidate) => candidate !== locale).map((candidate) => OG_LOCALE_MAP[candidate]),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [OG_IMAGE],
    },
  };
}

export default async function Rootlayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = assertLocale(rawLocale);
  // Only the shell needs messages at this level: the header, footer and
  // quick-donation widget. Each ported page adds its own namespaces through
  // , per PERFORMANCE_BUDGET.md. The legacy namespaces stay
  // here while the pre-Minbar routes are still served through this layout.
  const messages = pickNamespaces(locale, [...SHELL_NAMESPACES, ...LEGACY_NAMESPACES]);
  const tagline = String(
    (pickNamespaces(locale, ["homepage"]).homepage as Record<string, string> | undefined)
      ?.orgDescription ?? ""
  );
  // Direction comes from the locale catalog, not a hand-written check  Urdu is
  // RTL too, and the previous `locale === "ar"` test silently rendered it LTR.
  const dir = localeDirection(locale);
  // Drives where the header's account icon points (`[AUTH-INTEGRATION]`).
  // Categories feed the header's projects dropdown and the footer's band; super
  // categories join them in the dropdown only.
  const [session, categories, superCategories] = await Promise.all([
    getServerSession(authOptions),
    listCategories(locale),
    listNavSuperCategories(locale),
  ]);
  const navCategories: NavCategory[] = categories.filter(c=>c.navigationVisible!==false).map(({ id, href, name, image, projectCount }) => ({ id, href, name, image, projectCount }));
  const localeFont = LOCALE_FONT_STYLESHEETS[locale];

  // Phones hide the hero pattern (styles/minbar/minbar.css), so only wider screens need it early.
  preload(PATTERN_TILE, { as: "image", fetchPriority: "high", media: "(min-width: 761px)" });
  for (const font of dir === "rtl" ? RTL_TEXT_FONTS : LTR_TEXT_FONTS) {
    preload(font, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    <IntlProviderClient locale={locale} messages={messages}>
      {/* React hoists a stylesheet link with `precedence` into <head>. */}
      {localeFont ? <link rel="stylesheet" href={localeFont} precedence="default" /> : null}
      <SyncHtmlDir locale={locale} />
      <MarketingRuntime>
        {/* `mia-scope` is what confines the Minbar design tokens to the public
            site; the dashboard shares this app's root layout and must not
            inherit them. See styles/minbar/minbar.css. */}
        <div className="mia-scope" dir={dir} lang={locale}>
          <CurrencyProvider>
            <Suspense fallback={null}>
              <CurrencyFromUrlSync />
            </Suspense>
            <SessionProvider>
              <PreferredLangSync />
              <ScrollToTop />
              <Header signedIn={!!session?.user} isAdmin={session?.user?.role === "ADMIN"} categories={navCategories} superCategories={superCategories} />
              <MobileBottomNav signedIn={!!session?.user} />
              {/* No top padding here: the header renders its own spacer, sized
                  from its measured height, because that height changes with the
                  language, the back button and the viewport. */}
              <main>{children}</main>
              {/* The tagline is the footer's one string from the `homepage`
                  namespace. Passing it in keeps a 10KB bundle out of the shell
                  for the sake of a single sentence. */}
              {/* Hydrated in its own task, after the page above it. */}
              <Suspense fallback={null}>
                <MinbarFooter tagline={tagline} categories={navCategories} />
              </Suspense>
              <ConciergeLauncher />
              <CartReminder />
              <ConfettiProvider />
              <Toaster position="top-center" />
            </SessionProvider>
          </CurrencyProvider>
          {/* Analytics is mounted once, in the root layout. Both are Vercel-only:
              on the VPS their scripts 404 and log console errors. */}
          {isVercelDeployment() ? <SpeedInsights /> : null}
        </div>
      </MarketingRuntime>
    </IntlProviderClient>
  );
}
