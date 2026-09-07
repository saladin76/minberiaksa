import type { Metadata } from "next";
import { LOCALE_SEO, OG_LOCALE_MAP, OG_IMAGE, SITE_URL, buildHreflang } from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import Header from "@/components/minbar/shell/Header";
import MinbarFooter from "@/components/minbar/shell/Footer";
import QuickDonate from "@/components/minbar/shell/QuickDonate";
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
import { MarketingRuntime } from "@/components/MarketingRuntime";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import "@/styles/minbar/minbar.css";
import "@/styles/minbar/locale-fonts.css";

// Valid public locales derive from the single source of truth (enabled set).
const VALID_LOCALES = SUPPORTED_LOCALES;
const DEFAULT_LOCALE = "ar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (VALID_LOCALES.includes(rawLocale as (typeof VALID_LOCALES)[number]) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const seo = LOCALE_SEO[locale];
  const alternates = buildHreflang("/", locale);

  return {
    title: { default: seo.title, template: seo.titleTemplate },
    description: seo.description,
    keywords: seo.keywords,
    icons: { icon: "/yedicijan_logo.png" },
    alternates,
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${SITE_URL}/${locale}`,
      siteName: seo.siteName,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: seo.siteName }],
      locale: OG_LOCALE_MAP[locale],
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
  const locale = VALID_LOCALES.includes(rawLocale as (typeof VALID_LOCALES)[number])
    ? rawLocale
    : DEFAULT_LOCALE;
  // Only the shell needs messages at this level: the header, footer and
  // quick-donation widget. Each ported page adds its own namespaces through
  // , per PERFORMANCE_BUDGET.md. The legacy namespaces stay
  // here while the pre-Minbar routes are still served through this layout.
  const messages = pickNamespaces(locale, [...SHELL_NAMESPACES, ...LEGACY_NAMESPACES]);
  const tagline = String(
    (pickNamespaces(locale, ["homepage"]).homepage as Record<string, string> | undefined)
      ?.orgDescription ?? ""
  );
  // Direction comes from the locale catalog, not a hand-written check — Urdu is
  // RTL too, and the previous `locale === "ar"` test silently rendered it LTR.
  const dir = localeDirection(locale);
  // Drives where the header's account icon points (`[AUTH-INTEGRATION]`).
  const session = await getServerSession(authOptions);

  return (
    <IntlProviderClient locale={locale || "ar"} messages={messages}>
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
              <Header signedIn={!!session?.user} />
              {/* No top padding here: the header renders its own spacer, sized
                  from its measured height, because that height changes with the
                  language, the back button and the viewport. */}
              <main>{children}</main>
              {/* The tagline is the footer's one string from the `homepage`
                  namespace. Passing it in keeps a 10KB bundle out of the shell
                  for the sake of a single sentence. */}
              <MinbarFooter tagline={tagline} />
              <QuickDonate />
              <CartReminder />
              <ConfettiProvider />
              <Toaster position="top-center" />
            </SessionProvider>
          </CurrencyProvider>
          <Analytics />
          <SpeedInsights />
        </div>
      </MarketingRuntime>
    </IntlProviderClient>
  );
}
