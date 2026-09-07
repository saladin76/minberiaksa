import type { Metadata } from "next";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { MINBAR_LOCALE_SEO, MINBAR_OG_LOCALES } from "@/lib/seo-minbar.generated";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.yedicihan.org").replace(/\/$/, "");
export const SITE_NAME = "Yedicihan";
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// Locales derive from the single source of truth (`lib/locales.ts`). The
// per-locale maps below are `Record<Locale, …>`, so enabling a new public locale
// becomes a compile error here until its SEO/OG content is filled in — that is the
// intended drift guard for translated content.
export const LOCALES = SUPPORTED_LOCALES;
export type Locale = SupportedLocale;

export const OG_LOCALE_MAP: Record<Locale, string> = {
  ar: "ar_SA",
  en: "en_US",
  fr: "fr_FR",
  tr: "tr_TR",
  id: "id_ID",
  pt: "pt_BR",
  es: "es_ES",
  de: "de_DE",
  // Locales promoted to public with the Minbar design port.
  ...MINBAR_OG_LOCALES,
};

type LocaleSEO = {
  siteName: string;
  title: string;
  description: string;
  keywords: string[];
  titleTemplate: string;
  campaigns: { title: string; description: string };
  about: { title: string; description: string };
  contact: { title: string; description: string };
  blog: { title: string; description: string };
};

export const LOCALE_SEO: Record<Locale, LocaleSEO> = {
  ar: {
    siteName: "جمعية يدي جيهان",
    title: "جمعية يدي جيهان | زكاة، تبرع، صدقة، إغاثة إنسانية",
    description: "جمعية يدي جيهان — تبرع لإنقاذ أرواح الأطفال والمرضى السوريين. ادفع زكاتك وصدقتك لعمليات طبية عاجلة، كفالة أيتام، وإغاثة إنسانية شاملة. موثوق منذ 2011.",
    keywords: [
      "جمعية يدي جيهان", "تبرع سوريا", "زكاة المال اونلاين", "صدقة جارية",
      "كفالة يتيم", "إغاثة إنسانية سوريا", "تبرع عملية طبية عاجلة", "مساعدة أطفال سوريا",
      "تبرع رمضان", "مشاريع تبرع خيرية", "جمعية خيرية إسلامية", "تبرع اونلاين",
      "مشاريع إنسانية سوريا", "دعم المرضى السوريين", "عمليات قلب سوريا",
      "تبرع طارئ سوريا", "صدقة اونلاين", "كفالة أسرة", "مساعدة اليتامى",
      "تبرع تعليم أطفال", "إغاثة الأطفال السوريين", "منصة تبرع موثوقة",
    ],
    titleTemplate: "%s | جمعية يدي جيهان",
    campaigns: {
      title: "مشاريع التبرع | جمعية يدي جيهان – زكاة، صدقة، إغاثة إنسانية",
      description: "تصفح مشاريع التبرع الطبية والإنسانية الفعّالة. زكاتك وصدقتك تموّل عمليات عاجلة وعلاجات حيوية وكفالة أيتام للأسر السورية المحتاجة.",
    },
    about: {
      title: "من نحن | جمعية يدي جيهان",
      description: "جمعية يدي جيهان منظمة إنسانية إسلامية موثوقة تأسست 2011 لدعم الأطفال والأسر السورية المحتاجة. تعرّف على رسالتنا وقيمنا ومشاريعنا الإنسانية.",
    },
    contact: {
      title: "تواصل معنا | جمعية يدي جيهان",
      description: "هل لديك سؤال أو تريد التبرع؟ تواصل مع فريق جمعية يدي جيهان — نرد على استفساراتك في أقرب وقت.",
    },
    blog: {
      title: "أخبار وتقارير ميدانية | جمعية يدي جيهان",
      description: "آخر الأخبار والتقارير الميدانية حول المشاريع الإنسانية والطبية والتعليمية في سوريا من جمعية يدي جيهان.",
    },
  },

  en: {
    siteName: "Yedicihan Relief & Solidarity Association",
    title: "Yedicihan | Zakat, Donate, Sadaqah & Humanitarian Relief – يدي جيهان",
    description: "Yedicihan (يدي جيهان) – Trusted Islamic charity since 2011. Donate zakat, sadaqah & emergency funds for urgent Syrian medical aid, orphan sponsorship, and humanitarian relief. 100% goes to beneficiaries.",
    keywords: [
      "Yedicihan charity", "donate to Syria", "zakat online", "sadaqah donation",
      "Syrian medical aid", "orphan sponsorship Syria", "urgent surgery donation",
      "humanitarian relief Syria", "Islamic charity donation", "Muslim charity online",
      "Syrian children help", "emergency medical fund Syria", "donate for Syria online",
      "Ramadan donation", "sponsor Syrian family", "heart surgery Syria donation",
      "Syrian refugees charity", "online charity Syria", "nonprofit Syria",
      "reliable Islamic charity", "charity for Syrian orphans",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Donation Campaigns | Yedicihan – Zakat, Sadaqah & Syrian Relief",
      description: "Browse active medical and humanitarian donation campaigns. Your zakat and sadaqah directly fund urgent surgeries, orphan care, and life-saving aid for Syrian families.",
    },
    about: {
      title: "About Us | Yedicihan – Trusted Islamic Humanitarian Charity Since 2011",
      description: "Yedicihan is a transparent Islamic humanitarian charity founded in 2011, dedicated to saving Syrian lives through medical aid, orphan sponsorship, and education support.",
    },
    contact: {
      title: "Contact Us | Yedicihan – يدي جيهان Charity",
      description: "Have a question or want to donate? Reach out to the Yedicihan team — we're here to help you give your zakat and sadaqah where it's needed most.",
    },
    blog: {
      title: "News & Field Reports | Yedicihan – Syrian Relief Updates",
      description: "Latest field reports and news from Yedicihan's humanitarian, medical, and educational projects supporting Syrian children and families.",
    },
  },

  fr: {
    siteName: "Yedicihan – Association Humanitaire يدي جيهان",
    title: "Yedicihan | Zakat, Don, Sadaqa & Aide Humanitaire Syrie – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — Association islamique de confiance depuis 2011. Faites votre zakat, sadaqa et dons d'urgence pour l'aide médicale syrienne, parrainage d'orphelins et secours humanitaire.",
    keywords: [
      "Yedicihan association", "don Syrie", "zakat en ligne", "sadaqa don",
      "aide médicale Syrie", "parrainage orphelin Syrie", "don chirurgie urgence",
      "aide humanitaire Syrie", "association islamique caritative", "charité musulmane",
      "enfants syriens aide", "don urgence médical Syrie", "ONG Syrie",
      "don Ramadan", "parrainer famille syrienne", "réfugiés syriens aide",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Campagnes de Don | Yedicihan – Zakat, Sadaqa & Aide Syrienne",
      description: "Parcourez les campagnes de dons médicaux et humanitaires. Votre zakat et sadaqa financent des chirurgies urgentes, le parrainage d'orphelins et l'aide aux familles syriennes.",
    },
    about: {
      title: "Qui Sommes-Nous | Yedicihan – Association Humanitaire Islamique depuis 2011",
      description: "Yedicihan est une association islamique humanitaire transparente fondée en 2011, dédiée à sauver des vies syriennes par l'aide médicale, le parrainage d'orphelins et le soutien éducatif.",
    },
    contact: {
      title: "Contactez-Nous | Yedicihan – يدي جيهان",
      description: "Une question ou souhaitez faire un don ? Contactez l'équipe Yedicihan — nous vous aidons à placer votre zakat et sadaqa là où c'est le plus nécessaire.",
    },
    blog: {
      title: "Actualités & Rapports de Terrain | Yedicihan – Aide Syrie",
      description: "Derniers rapports de terrain et actualités des projets humanitaires, médicaux et éducatifs de Yedicihan en Syrie.",
    },
  },

  tr: {
    siteName: "Yedicihan Derneği – يدي جيهان İnsani Yardım",
    title: "Yedicihan Derneği | Zekat, Bağış, Sadaka & İnsani Yardım – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — 2011'den beri güvenilir İslami yardım derneği. Zekatınızı, sadakanızı ve acil bağışlarınızı Suriyeli hastalara, yetimlere ve ailelere ulaştırıyoruz. Şeffaf ve güvenilir.",
    keywords: [
      "Yedicihan derneği", "Suriye bağış", "zekat online", "sadaka bağışı",
      "Suriye tıbbi yardım", "yetim sponsorluğu Suriye", "acil ameliyat bağışı",
      "insani yardım Suriye", "İslami hayır derneği", "Müslüman hayır kurumu",
      "Suriyeli çocuklar yardım", "acil tıbbi yardım Suriye", "Ramazan bağışı",
      "Suriyeli aile sponsorluğu", "STK Suriye yardım", "güvenilir bağış platformu",
    ],
    titleTemplate: "%s | Yedicihan Derneği – يدي جيهان",
    campaigns: {
      title: "Bağış Kampanyaları | Yedicihan – Zekat, Sadaka & Suriye Yardımı",
      description: "Aktif tıbbi ve insani yardım kampanyalarına göz atın. Zekatınız ve sadakanız acil ameliyatları, yetim bakımını ve Suriyeli ailelere yardımı finanse eder.",
    },
    about: {
      title: "Hakkımızda | Yedicihan – 2011'den Beri Güvenilir İnsani Yardım Derneği",
      description: "Yedicihan, 2011'de kurulan şeffaf bir İslami insani yardım derneğidir. Tıbbi yardım, yetim sponsorluğu ve eğitim desteğiyle Suriyeli hayatlara dokunuyoruz.",
    },
    contact: {
      title: "İletişim | Yedicihan Derneği – يدي جيهان",
      description: "Sorularınız mı var ya da bağış yapmak mı istiyorsunuz? Yedicihan ekibiyle iletişime geçin — zekat ve sadakanızı en çok ihtiyaç duyulan yere ulaştıralım.",
    },
    blog: {
      title: "Haberler & Saha Raporları | Yedicihan – Suriye Yardım Güncellemeleri",
      description: "Yedicihan'nin Suriye'deki insani, tıbbi ve eğitim projelerine ilişkin son saha raporları ve haberler.",
    },
  },

  id: {
    siteName: "Yedicihan – Yayasan Kemanusiaan يدي جيهان",
    title: "Yedicihan | Zakat, Donasi, Sedekah & Bantuan Kemanusiaan Suriah – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — Yayasan Islam terpercaya sejak 2011. Tunaikan zakat, sedekah, dan donasi darurat untuk bantuan medis Suriah, sponsor yatim, dan bantuan kemanusiaan. Transparan & amanah.",
    keywords: [
      "Yedicihan yayasan", "donasi Suriah", "zakat online", "sedekah donasi",
      "bantuan medis Suriah", "sponsor anak yatim Suriah", "donasi operasi darurat",
      "bantuan kemanusiaan Suriah", "yayasan Islam amanah", "donasi Muslim online",
      "anak-anak Suriah bantuan", "donasi darurat medis", "NGO Suriah",
      "donasi Ramadan", "sponsor keluarga Suriah", "lembaga donasi terpercaya",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Kampanye Donasi | Yedicihan – Zakat, Sedekah & Bantuan Suriah",
      description: "Telusuri kampanye donasi medis dan kemanusiaan aktif. Zakat dan sedekah Anda membiayai operasi darurat, perawatan yatim, dan bantuan bagi keluarga Suriah.",
    },
    about: {
      title: "Tentang Kami | Yedicihan – Yayasan Kemanusiaan Islam Terpercaya Sejak 2011",
      description: "Yedicihan adalah yayasan kemanusiaan Islam yang transparan, didirikan tahun 2011 untuk menyelamatkan nyawa warga Suriah melalui bantuan medis, sponsor yatim, dan dukungan pendidikan.",
    },
    contact: {
      title: "Hubungi Kami | Yedicihan – يدي جيهان",
      description: "Ada pertanyaan atau ingin berdonasi? Hubungi tim Yedicihan — kami membantu Anda menyalurkan zakat dan sedekah ke tempat yang paling membutuhkan.",
    },
    blog: {
      title: "Berita & Laporan Lapangan | Yedicihan – Update Bantuan Suriah",
      description: "Laporan lapangan dan berita terbaru dari proyek kemanusiaan, medis, dan pendidikan Yedicihan di Suriah.",
    },
  },

  pt: {
    siteName: "Yedicihan – Associação Humanitária يدي جيهان",
    title: "Yedicihan | Zakat, Doação, Sadaqa & Ajuda Humanitária Síria – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — Organização islâmica de confiança desde 2011. Pague seu zakat, sadaqa e doações de emergência para ajuda médica síria, apadrinhamento de órfãos e socorro humanitário. Transparente e seguro.",
    keywords: [
      "Yedicihan associação", "doação Síria", "zakat online", "sadaqa doação",
      "ajuda médica Síria", "apadrinhamento órfão Síria", "doação cirurgia urgente",
      "ajuda humanitária Síria", "organização islâmica beneficente", "caridade muçulmana",
      "crianças sírias ajuda", "doação médica urgente Síria", "ONG Síria",
      "doação Ramadã", "patrocinar família síria", "plataforma doação confiável",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Campanhas de Doação | Yedicihan – Zakat, Sadaqa & Ajuda Síria",
      description: "Explore campanhas de doações médicas e humanitárias ativas. Seu zakat e sadaqa financiam cirurgias urgentes, cuidados com órfãos e ajuda às famílias sírias.",
    },
    about: {
      title: "Sobre Nós | Yedicihan – Organização Humanitária Islâmica desde 2011",
      description: "Yedicihan é uma organização humanitária islâmica transparente, fundada em 2011 para salvar vidas sírias por meio de ajuda médica, apadrinhamento de órfãos e apoio educacional.",
    },
    contact: {
      title: "Contacte-Nos | Yedicihan – يدي جيهان",
      description: "Tem dúvidas ou quer fazer uma doação? Entre em contato com a equipa Yedicihan — ajudamos a canalizar seu zakat e sadaqa para quem mais precisa.",
    },
    blog: {
      title: "Notícias & Relatórios de Campo | Yedicihan – Atualizações Síria",
      description: "Últimos relatórios de campo e notícias dos projetos humanitários, médicos e educacionais da Yedicihan na Síria.",
    },
  },

  es: {
    siteName: "Yedicihan – Asociación Humanitaria يدي جيهان",
    title: "Yedicihan | Zakat, Donación, Sadaqa & Ayuda Humanitaria Siria – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — Organización islámica de confianza desde 2011. Paga tu zakat, sadaqa y donaciones de emergencia para ayuda médica siria, apadrinamiento de huérfanos y socorro humanitario. Transparente y seguro.",
    keywords: [
      "Yedicihan organización", "donación Siria", "zakat online", "sadaqa donación",
      "ayuda médica Siria", "apadrinamiento huérfano Siria", "donación cirugía urgente",
      "ayuda humanitaria Siria", "organización islámica benéfica", "caridad musulmana",
      "niños sirios ayuda", "donación médica urgente Siria", "ONG Siria",
      "donación Ramadán", "patrocinar familia siria", "plataforma donación confiable",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Campañas de Donación | Yedicihan – Zakat, Sadaqa & Ayuda Siria",
      description: "Explora campañas de donación médica y humanitaria activas. Tu zakat y sadaqa financian cirugías urgentes, cuidado de huérfanos y ayuda a familias sirias.",
    },
    about: {
      title: "Quiénes Somos | Yedicihan – Organización Humanitaria Islámica desde 2011",
      description: "Yedicihan es una organización humanitaria islámica transparente, fundada en 2011 para salvar vidas sirias mediante ayuda médica, apadrinamiento de huérfanos y apoyo educativo.",
    },
    contact: {
      title: "Contáctanos | Yedicihan – يدي جيهان",
      description: "¿Tienes preguntas o quieres donar? Contacta al equipo de Yedicihan — te ayudamos a canalizar tu zakat y sadaqa donde más se necesita.",
    },
    blog: {
      title: "Noticias & Informes de Campo | Yedicihan – Actualizaciones Siria",
      description: "Últimos informes de campo y noticias de los proyectos humanitarios, médicos y educativos de Yedicihan en Siria.",
    },
  },

  de: {
    siteName: "Yedicihan – Humanitärer Verein يدي جيهان",
    title: "Yedicihan | Zakat, Spende, Sadaqa & Humanitäre Hilfe Syrien – يدي جيهان",
    description: "Yedicihan (يدي جيهان) — Vertrauenswürdige islamische Hilfsorganisation seit 2011. Spende deine Zakat, Sadaqa und Soforthilfe für syrische Medizinversorgung, Waisen­patenschaften und humanitäre Hilfe. Transparent und sicher.",
    keywords: [
      "Yedicihan Verein", "Spende Syrien", "Zakat online", "Sadaqa Spende",
      "medizinische Hilfe Syrien", "Waisenpatenschaft Syrien", "Spende Notoperation",
      "humanitäre Hilfe Syrien", "islamische Hilfsorganisation", "muslimische Wohltätigkeit",
      "syrische Kinder Hilfe", "medizinischer Notfallfonds Syrien", "NGO Syrien",
      "Ramadan Spende", "syrische Familie patenschaft", "verlässliche Spendenplattform",
    ],
    titleTemplate: "%s | Yedicihan – يدي جيهان",
    campaigns: {
      title: "Spendenkampagnen | Yedicihan – Zakat, Sadaqa & Syrien-Hilfe",
      description: "Entdecke aktive medizinische und humanitäre Spendenkampagnen. Deine Zakat und Sadaqa finanzieren dringende Operationen, Waisenversorgung und Hilfe für syrische Familien.",
    },
    about: {
      title: "Über Uns | Yedicihan – Vertrauenswürdige Islamische Hilfsorganisation seit 2011",
      description: "Yedicihan ist eine transparente islamische humanitäre Organisation, gegründet 2011, um syrische Leben durch medizinische Hilfe, Waisenpatenschaft und Bildungsförderung zu retten.",
    },
    contact: {
      title: "Kontakt | Yedicihan – يدي جيهان",
      description: "Hast du Fragen oder möchtest spenden? Kontaktiere das Yedicihan-Team — wir leiten deine Zakat und Sadaqa dorthin, wo sie am dringendsten gebraucht werden.",
    },
    blog: {
      title: "Nachrichten & Feldberichte | Yedicihan – Syrien-Hilfe Updates",
      description: "Aktuelle Feldberichte und Neuigkeiten zu den humanitären, medizinischen und Bildungsprojekten von Yedicihan in Syrien.",
    },
  },

  // The 11 locales promoted to public with the Minbar design port. Their copy is
  // generated from the handoff's own per-language bundles rather than written
  // here, so it stays in step with `scripts/sync-minbar-messages.mjs`.
  ...MINBAR_LOCALE_SEO,
};

/** Build hreflang alternates for a given path (e.g. "/campaigns") */
export function buildHreflang(path: string, currentLocale: string) {
  const normalizedPath = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${normalizedPath}`;
  }
  languages["x-default"] = `${SITE_URL}/ar${normalizedPath}`;
  return {
    canonical: `${SITE_URL}/${currentLocale}${normalizedPath}`,
    languages,
  };
}

/**
 * Build hreflang/canonical alternates for a slug-routed entity (campaign, post,
 * category) where each locale may have its OWN translation slug.
 *
 * Each locale's URL uses its own per-locale slug when present, falling back to
 * the entity's base slug, then to `fallback` (typically the entity id).
 *
 * Example: an AR campaign with slug "زكاة-القدس" and an EN translation slug
 * "pay-your-zakat-at-al-quds" yields:
 *   hreflang="ar" → /ar/campaign/زكاة-القدس
 *   hreflang="en" → /en/campaign/pay-your-zakat-at-al-quds
 *
 * Without this, Google sees the same slug under every hreflang and may drop
 * the per-locale variants from the index.
 */
export function buildLocalizedAlternates(args: {
  /** URL prefix without trailing slash, e.g. "/campaign", "/blog", "/category" */
  basePath: string;
  /** Default-locale (Arabic) slug from the entity row */
  baseSlug?: string | null;
  /** Per-locale translation rows; only `locale` and optional `slug` are used */
  translations?: Array<{ locale: string; slug?: string | null }> | null;
  /** Used when neither a translation slug nor base slug is set (typically the entity id) */
  fallback: string;
  /** Locale of the page we're rendering — drives `canonical` */
  currentLocale: string;
}): { canonical: string; languages: Record<string, string> } {
  const { basePath, baseSlug, translations, fallback, currentLocale } = args;
  const slugFor = (loc: string): string => {
    const t = translations?.find((tt) => tt.locale === loc && tt.slug);
    return t?.slug || baseSlug || fallback;
  };
  const url = (loc: string): string =>
    `${SITE_URL}/${loc}${basePath}/${encodeURIComponent(slugFor(loc))}`;

  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = url(locale);
  languages["x-default"] = url("ar");
  return { canonical: url(currentLocale), languages };
}

/** Build full per-page metadata (layout/page generateMetadata helper) */
export function buildPageMetadata(
  locale: string,
  overrides: {
    title: string;
    description: string;
    path: string;
    image?: string;
    keywords?: string[];
    type?: "website" | "article";
  }
): Metadata {
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  const image = overrides.image ?? OG_IMAGE;
  const alternates = buildHreflang(overrides.path, locale);

  return {
    title: overrides.title,
    description: overrides.description,
    keywords: overrides.keywords ?? seo.keywords,
    alternates,
    openGraph: {
      title: overrides.title,
      description: overrides.description,
      url: alternates.canonical,
      siteName: seo.siteName,
      locale: OG_LOCALE_MAP[locale as Locale] ?? "en_US",
      type: overrides.type ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: overrides.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: overrides.title,
      description: overrides.description,
      images: [image],
    },
  };
}
