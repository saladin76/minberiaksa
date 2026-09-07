import type { ReactNode } from "react";
import IntlProviderClient from "@/app/[locale]/IntlProviderClient";
import { SHELL_NAMESPACES, pickNamespaces } from "@/i18n/locale-messages";

/**
 * Provides a page with exactly the message namespaces it renders.
 *
 * `PERFORMANCE_BUDGET.md` requires "Locale الحالية × Namespaces الصفحة فقط" —
 * the current locale crossed with the page's own namespaces, not the whole
 * catalog. The layout carries the shell bundle for the header, footer and
 * quick-donation widget; each ported page wraps its content in this and names
 * what it needs.
 *
 * The provider nested here replaces the context for its subtree rather than
 * extending it, so the shell namespaces are included again — that is ~14KB, set
 * against the ~115KB saved by not shipping every namespace to every page.
 *
 * @example
 *   <MinbarMessages locale={locale} namespaces={["homepage", "achievements", "quran"]}>
 *     <ZakatPage />
 *   </MinbarMessages>
 */
export default function MinbarMessages({
  locale,
  namespaces,
  children,
}: {
  locale: string;
  namespaces: readonly string[];
  children: ReactNode;
}) {
  const messages = pickNamespaces(locale, [...SHELL_NAMESPACES, ...namespaces]);
  return (
    <IntlProviderClient locale={locale} messages={messages}>
      {children}
    </IntlProviderClient>
  );
}
