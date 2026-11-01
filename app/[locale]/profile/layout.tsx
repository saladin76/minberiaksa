import type { Metadata } from "next";
import IntlProviderClient from "../IntlProviderClient";
import { LEGACY_NAMESPACES, SHELL_NAMESPACES, pickNamespaces } from "@/i18n/locale-messages";
import { isValidLocale } from "@/lib/locales";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NoIndexLayout({ children, params }: { children: React.ReactNode; params: Promise<{locale: string}> }) {
  const { locale: requested } = await params;
  const locale = isValidLocale(requested) ? requested : "ar";
  // Keep account-only copy out of every public page's message payload.
  const cardCopy = (await import(`@/i18n/profile-card-update/${locale}.json`)).default;
  return <IntlProviderClient locale={locale} messages={{...pickNamespaces(locale, [...SHELL_NAMESPACES, ...LEGACY_NAMESPACES, "cart"]), ProfileCardUpdate: cardCopy}}>{children}</IntlProviderClient>;
}
