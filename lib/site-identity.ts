import type { Metadata } from "next";
import { LOCALE_SEO, SITE_URL, type Locale } from "./seo";
import { SUPPORTED_LOCALES } from "./locales";

/** Google has one site name per hostname, including its locale homepages. */
export function siteIdentitySchemas(locale: string) {
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "NGO"], "@id": `${SITE_URL}/#organization`,
        url: `${SITE_URL}/`, name: seo.siteName, legalName: seo.siteName,
        description: seo.description,
        logo: { "@type": "ImageObject", "@id": `${SITE_URL}/#logo`, url: `${SITE_URL}/brand/minber-logo-full.webp`, width: 2603, height: 633, caption: seo.siteName },
      },
      {
        "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`,
        name: LOCALE_SEO.ar.siteName,
        alternateName: [LOCALE_SEO.en.siteName, LOCALE_SEO.tr.siteName],
        inLanguage: [...SUPPORTED_LOCALES], publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

/** Keep an authored homepage's intent while replacing its retired short brand
 * suffix. Never clip or duplicate the institution's complete official name. */
export function institutionalHomeTitle(title: string, locale: string): string {
  const name = (LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en).siteName;
  if (title.includes(name)) return title;
  const intent = title.replace(/\s*\|\s*(?:مؤسسة منبر الأقصى(?: الدولية)?|Minberiaksa|Minbar Al[- ]Aqsa|Minber-i Aks[aâ]|Minberi Aks[aâ])\s*$/iu, "").trim();
  return intent ? `${intent} | ${name}` : name;
}

export function withInstitutionalHomeIdentity(metadata: Metadata, locale: string): Metadata {
  const existing = typeof metadata.title === "string" ? metadata.title : metadata.title && "absolute" in metadata.title ? metadata.title.absolute : null;
  const name = (LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en).siteName;
  const title = institutionalHomeTitle(existing || name, locale);
  return { ...metadata, title: { absolute: title }, applicationName: name,
    openGraph: { ...metadata.openGraph, title, siteName: name },
    twitter: { ...metadata.twitter, title },
  };
}
