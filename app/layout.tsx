import type { Metadata } from "next";
import { Suspense } from "react";
import { Amiri, Cairo, Montserrat, Poppins, Tajawal } from "next/font/google";
import DeferredGTM from "@/components/DeferredGTM";
import MicrosoftClarity from "@/components/MicrosoftClarity";
import EngagementInstrumentation from "@/components/EngagementInstrumentation";
import { Analytics } from "@vercel/analytics/next";
import "./[locale]/globals.css";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

const tajawal = Tajawal({
  weight: ["400", "500", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

/**
 * Minbar identity type. The brand leans heavy — headings and CTAs are 800–900 —
 * so those weights are loaded rather than synthesised, which is what makes a
 * faux-bold Arabic heading look wrong.
 *
 * `Cairo` is the Arabic/Urdu face, `Montserrat` the Latin/Turkish one, and
 * `Amiri` is reserved for Qur'anic verses and hadith, which the design always
 * renders in Arabic script regardless of the page language.
 * Non-Latin locales (ja/zh/hi) load their own faces in
 * `styles/minbar/locale-fonts.css`, on demand.
 */
const cairo = Cairo({
  weight: ["400", "600", "700", "800", "900"],
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const montserrat = Montserrat({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-montserrat",
  display: "swap",
});

const amiri = Amiri({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-amiri",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.yedicihan.org";
const OG_IMAGE = `/yedicijan_logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),

  title: {
    default: "جمعية يدي جيهان | زكاة، تبرع، صدقة، إغاثة إنسانية",
    template: "%s | جمعية يدي جيهان",
  },

  description:
    "جمعية يدي جيهان الدولية للتضامن: جمعية تركية عاملة للنفع العام تأسست عام 1961، تعمل في الصحة والإغاثة العاجلة والاستجابة للكوارث والمساعدات التعليمية. تبرع، زكاة، صدقة جارية. Yedicihan International Solidarity Association — a Turkish public-benefit association founded in 1961, working in healthcare, emergency relief, disaster response and educational aid.",

  keywords: [
    "يدي جيهان", "جمعية يدي جيهان", "جمعية عاملة للنفع العام", "جمعية خيرية تركية",
    "تبرع", "زكاة المال", "صدقة جارية", "تبرع اونلاين", "زكاة اونلاين",
    "إغاثة عاجلة", "إغاثة الكوارث", "مساعدات تعليمية", "مساعدات طبية",
    "تبرع للزلزال", "ترميم المنازل", "مشاريع إنسانية", "حملات تبرع", "تبرع رمضان",
    "Yedicihan", "Yedicihan Association", "Turkish charity", "public benefit association",
    "donate online", "zakat donation online", "sadaqah online", "charity donation",
    "emergency relief", "disaster relief donation", "education aid", "medical aid",
    "earthquake relief donation", "home rebuilding charity", "humanitarian projects",
    "Yedicihan Derneği", "Yedicihan Uluslararası Yardımlaşma Derneği",
    "kamu yararına dernek", "bağış yap", "zekat bağışı", "sadaka online",
    "acil yardım", "afet yardımı", "eğitim yardımı", "sağlık yardımı",
    "deprem bağışı", "hayır derneği bağış", "online zekat ver", "Ramazan bağışı",
    "association caritative turque", "faire un don", "zakat en ligne", "sadaqa en ligne",
    "aide d'urgence", "aide aux catastrophes", "aide à l'éducation",
    "türkischer Hilfsverein", "jetzt spenden", "Zakat online", "Nothilfe spenden",
    "Katastrophenhilfe", "Bildungshilfe",
    "asociación benéfica turca", "donar en línea", "zakat en línea",
    "ayuda de emergencia", "ayuda educativa",
    "associação de caridade turca", "doar online", "zakat online",
    "ajuda de emergência", "apoio à educação",
    "amal Turki terpercaya", "donasi online", "zakat online", "sedekah online",
    "bantuan darurat", "bantuan bencana", "bantuan pendidikan",
  ],

  authors: [{ name: "Yedicihan Derneği", url: SITE }],
  creator: "Yedicihan",
  publisher: "Yedicihan",

  // Browser tab + the icon Google shows beside a search result. Declared here
  // as well as in the locale and dashboard layouts so routes that sit under
  // neither of those still get an icon instead of falling back to nothing —
  // there is no `favicon.ico` or `app/icon.*` file in this project.
  icons: { icon: "/yedicijan_logo.png" },

  alternates: {
    canonical: `${SITE}/ar`,
    languages: {
      ar: `${SITE}/ar`,
      en: `${SITE}/en`,
      fr: `${SITE}/fr`,
      tr: `${SITE}/tr`,
      id: `${SITE}/id`,
      pt: `${SITE}/pt`,
      es: `${SITE}/es`,
      de: `${SITE}/de`,
      "x-default": `${SITE}/ar`,
    },
  },

  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Yedicihan | يدي جيهان",
    title: "جمعية يدي جيهان | زكاة، تبرع، صدقة، إغاثة إنسانية",
    description:
      "جمعية عاملة للنفع العام منذ 1961 — الصحة، الإغاثة العاجلة، الاستجابة للكوارث، والتعليم. تبرع، زكاة، صدقة جارية. A Turkish public-benefit association serving since 1961 in healthcare, emergency relief, disaster response and education.",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Yedicihan – يدي جيهان" }],
    locale: "ar_SA",
    alternateLocale: ["en_US", "fr_FR", "tr_TR", "id_ID", "pt_BR", "es_ES", "de_DE"],
  },

  twitter: {
    card: "summary_large_image",
    site: "@yedicihann",
    creator: "@yedicihann",
    title: "Yedicihan | يدي جيهان – جمعية عاملة للنفع العام منذ 1961",
    description:
      "الصحة، الإغاثة العاجلة، الاستجابة للكوارث، والتعليم — زكاة، صدقة، تبرع. Healthcare, emergency relief, disaster response and education since 1961.",
    images: [OG_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  category: "charity",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": ["Organization", "NGO"],
  "@id": `${SITE}/#organization`,
  name: "Yedicihan",
  alternateName: ["يدي جيهان", "Yedicihan Derneği", "يدي جيهان"],
  url: SITE,
  logo: {
    "@type": "ImageObject",
    url: "/yedicijan_logo.png",
    width: 374,
    height: 206,
  },
  image: OG_IMAGE,
  description:
    "Yedicihan International Solidarity Association is a Turkish public-benefit association founded in 1961, working in healthcare, emergency relief, disaster response and educational aid.",
  foundingDate: "1961-11-09",
  areaServed: ["Turkey", "Global"],
  knowsLanguage: ["ar", "en", "fr", "tr", "id", "pt", "es", "de"],
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: "+90-530-651-65-49",
      email: "info@yedicihan.org",
      contactType: "customer service",
      availableLanguage: ["Turkish", "Arabic", "English"],
    },
  ],
  email: "info@yedicihan.org",
  telephone: "+90-530-651-65-49",
  sameAs: [
    "https://www.facebook.com/yedicihan",
    "https://www.instagram.com/yedicihan61/",
    "https://twitter.com/yedicihann",
    "https://wa.me/905306516549",
  ],
  address: {
    "@type": "PostalAddress",
    streetAddress: "Bağlar, Mimar Sinan Cd. No:38",
    addressLocality: "Bağcılar",
    addressRegion: "İstanbul",
    postalCode: "34209",
    addressCountry: "TR",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "Yedicihan | يدي جيهان",
  description:
    "Donate for Syrian medical aid, zakat, sadaqah, and orphan sponsorship. تبرع لعمليات طبية عاجلة وإغاثة إنسانية في سوريا.",
  inLanguage: ["ar", "en", "fr", "tr", "id", "pt", "es", "de"],
  publisher: { "@id": `${SITE}/#organization` },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE}/ar/campaigns?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "كيف يمكنني التبرع لجمعية يدي جيهان؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "يمكنك التبرع مباشرة عبر موقعنا الإلكتروني باختيار المشروع المناسب وإتمام الدفع بأمان عبر بطاقتك الائتمانية، أو عبر التحويل البنكي إلى أحد حساباتنا المعلنة في صفحة الحسابات البنكية. جميع التبرعات موثقة وتصل إلى المستفيدين.",
      },
    },
    {
      "@type": "Question",
      name: "هل يمكنني دفع زكاتي عبر منصة يدي جيهان؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "نعم، نقبل زكاة المال وزكاة الفطر، وتُوزَّع على المستحقين وفق الشروط الشرعية المعتمدة. يمكنك تخصيص تبرعك للزكاة عند إتمام عملية الدفع.",
      },
    },
    {
      "@type": "Question",
      name: "When was Yedicihan founded?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yedicihan International Solidarity Association was opened on 9 November 1961 by a group of doctors and nurses. It began its work in healthcare, most notably helping to develop the facilities of Haydarpaşa Numune Hospital and covering examination and medicine costs for patients of limited means.",
      },
    },
    {
      "@type": "Question",
      name: "Is Yedicihan an officially recognised association?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Yedicihan was granted the status of an “Association Working for the Public Benefit” by Council of Ministers Decision No. 6/2090, dated 10 August 1963, and is registered in Türkiye.",
      },
    },
    {
      "@type": "Question",
      name: "Yedicihan derneğine nasıl bağış yapabilirim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Web sitemizden dilediğiniz projeyi seçerek güvenli ödeme altyapımız üzerinden kredi kartıyla bağış yapabilir veya banka hesaplarımız sayfasındaki IBAN'lara havale/EFT gönderebilirsiniz. Tüm bağışlar belgelenmekte ve doğrudan ihtiyaç sahiplerine ulaştırılmaktadır.",
      },
    },
    {
      "@type": "Question",
      name: "Yedicihan hangi alanlarda faaliyet gösteriyor?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Derneğimiz kuruluşundan bu yana sağlık alanında çalışmaktadır. 2023 yılındaki kongremizde alınan yönetim ve tüzük değişikliği ile faaliyet alanımız doğal afetler, acil yardım ve eğitim yardımlarını da kapsayacak şekilde genişletilmiştir.",
      },
    },
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE}/ar` },
    { "@type": "ListItem", position: 2, name: "الحملات", item: `${SITE}/ar/campaigns` },
    { "@type": "ListItem", position: 3, name: "المدونة", item: `${SITE}/ar/blog` },
    { "@type": "ListItem", position: 4, name: "من نحن", item: `${SITE}/ar/about-us` },
    { "@type": "ListItem", position: 5, name: "تواصل معنا", item: `${SITE}/ar/contact-us` },
  ],
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
        <meta name="revisit-after" content="3 days" />
        <meta name="language" content="Arabic" />

        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://i.ibb.co" />
        <link rel="preload" href="/bg.webp" as="image" type="image/webp" />

        <script src="https://t.contentsquare.net/uxa/e81365186c19c.js" async />
      </head>
      <body
        className={`${poppins.variable} ${tajawal.variable} ${cairo.variable} ${montserrat.variable} ${amiri.variable} font-arabic antialiased`}
      >
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MMNBQQWB"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
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
