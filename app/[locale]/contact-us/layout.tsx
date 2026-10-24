import { buildManagedPageMetadata } from "@/lib/content-editor/page-seo";
import type { Metadata } from "next";
import { LOCALE_SEO } from "@/lib/seo";
import type { Locale } from "@/lib/seo";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return buildManagedPageMetadata("contact", locale, {
    title: seo.contact.title,
    description: seo.contact.description,
    path: "/contact-us",
    keywords: seo.keywords,
  });
}

export default function ContactLayout({ children }: Props) {
  return children;
}
