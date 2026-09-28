import type { Metadata } from "next";
import { Suspense } from "react";
import DeferredGTM from "@/components/DeferredGTM";
import MicrosoftClarity from "@/components/MicrosoftClarity";
import EngagementInstrumentation from "@/components/EngagementInstrumentation";
import { Analytics } from "@vercel/analytics/next";
import { LOCALES, LOCALE_SEO, OG_IMAGE, OG_LOCALE_MAP, SITE_NAME, SITE_URL, buildHreflang, isProductionDeployment } from "@/lib/seo";
import "./[locale]/globals.css";
import "@/styles/self-hosted-fonts.css";


/**
 * Minbar identity type. The brand leans heavy  headings and CTAs are 800–900 
 * so those weights are loaded rather than synthesised, which is what makes a
 * faux-bold Arabic heading look wrong.
 *
 * `Cairo` is the Arabic/Urdu face, `Montserrat` the Latin/Turkish one, and
 * `Amiri` is reserved for Qur'anic verses and hadith, which the design always
 * renders in Arabic script regardless of the page language.
 * Non-Latin locales (ja/zh/hi) load their own faces in
 * `styles/minbar/locale-fonts.css`, on demand.
 *
 * The files are self-hosted (`public/fonts/`, declared in
 * `styles/self-hosted-fonts.css`, refreshed by `scripts/vendor-google-fonts.mjs`)
 * rather than loaded through `next/font/google`: that helper downloads every
 * face at build time, and one failed download under Turbopack fails the whole
 * production build. The `site-fonts` class below sets the same CSS variables
 * the `next/font` objects used to, so Tailwind's `font-*` families are unchanged.
 */
const SITE_FONT_VARIABLES: React.CSSProperties = {
  ["--font-cairo" as string]: "'Cairo'",
  ["--font-montserrat" as string]: "'Montserrat'",
  ["--font-amiri" as string]: "'Amiri'",
  ["--font-poppins" as string]: "'Poppins'",
  ["--font-arabic" as string]: "'Tajawal'",
};

const SITE = SITE_URL;

/**
 * The root layout is deliberately thin on identity.
 *
 * It used to carry a second, independent SEO and identity stack: its own title,
 * description, keywords, OpenGraph, Twitter card, hreflang (8 locales, not 19),
 * plus Organization, WebSite, FAQPage and BreadcrumbList schemas. That copy
 * described a Turkish public-benefit association founded in 1961 working in
 * healthcare and earthquake relief, with an FAQ about Haydarpaşa Numune
 * Hospital  a different organisation's story, inherited with the codebase.
 * It shipped on every page, including the 19 locale pages whose own metadata
 * says what `Minbar/POSITIONING.md` says: an international foundation for
 * Al-Quds and Al-Aqsa. Two identities, one of them wrong, and the Organization
 * node even shared an `@id` with the homepage's  so a crawler had to pick.
 *
 * Now there is one source. Everything identity-shaped here derives from
 * `LOCALE_SEO` / `SUPPORTED_LOCALES`, and the structured data lives where
 * `Minbar/PRODUCTION_SEO_CONTRACT.md` § Structured Data puts it: Organization
 * and WebSite on the homepage, BreadcrumbList on inner pages, FAQPage only
 * where questions are actually rendered. What is left below is what genuinely
 * belongs to every route in the app  fonts, analytics, the indexing policy,
 * and a fallback title for the routes that sit outside `[locale]`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),

  /* The fallback for routes outside `[locale]` (the dashboard, error pages).
     Locale pages override all of this from the same generated source. */
  title: {
    default: LOCALE_SEO.ar.title,
    template: LOCALE_SEO.ar.titleTemplate,
  },
  description: LOCALE_SEO.ar.description,

  authors: [{ name: SITE_NAME, url: SITE }],
  creator: SITE_NAME,
  publisher: SITE_NAME,

  /* `app/favicon.ico` is the icon now  a real file, which is also what stops a
     browser's automatic `/favicon.ico` request from falling through to the
     `[locale]` segment. `icons` is left unset so Next uses it. */

  /* All 19 locales, from the same helper every page uses  this list was eight. */
  alternates: buildHreflang("/", "ar"),

  openGraph: {
    type: "website",
    url: SITE,
    siteName: LOCALE_SEO.ar.siteName,
    title: LOCALE_SEO.ar.title,
    description: LOCALE_SEO.ar.description,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: LOCALE_SEO.ar.siteName }],
    locale: OG_LOCALE_MAP.ar,
    alternateLocale: LOCALES.filter((l) => l !== "ar").map((l) => OG_LOCALE_MAP[l]),
  },

  twitter: {
    card: "summary_large_image",
    title: LOCALE_SEO.ar.title,
    description: LOCALE_SEO.ar.description,
    images: [OG_IMAGE],
  },

  /* Indexable on production only. A preview deployment carries production
     canonicals, which does not by itself stop its own URL being indexed 
     so it says noindex here, in `app/robots.ts`, and in the X-Robots-Tag
     header from `next.config.ts` (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.1). */
  robots: isProductionDeployment()
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : { index: false, follow: false, googleBot: { index: false, follow: false } },

  category: "charity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta name="geo.region" content="TR-34" />
        <meta name="geo.placename" content="İstanbul" />
        <meta name="classification" content="charity, humanitarian, nonprofit" />
        <meta name="rating" content="general" />

        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://i.ibb.co" />
        <link rel="preload" href="/bg.webp" as="image" type="image/webp" />

        <script src="https://t.contentsquare.net/uxa/e81365186c19c.js" async />
      </head>
      <body className="font-arabic antialiased" style={SITE_FONT_VARIABLES}>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MMNBQQWB"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <MicrosoftClarity />
        <Suspense fallback={null}>
          <EngagementInstrumentation />
        </Suspense>
        <DeferredGTM />
        <Analytics />
      </body>
    </html>
  );
}
