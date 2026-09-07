import { cookies } from "next/headers";
import "@/styles/minbar/minbar.css";
import "@/styles/minbar/locale-fonts.css";
import { messagesFor } from "@/i18n/locale-messages";
import { isValidLocale, localeDirection, DEFAULT_LOCALE } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { NotFoundIcon } from "@/components/minbar/states/StatusIcons";

/**
 * The root 404 — ported from `Minbar/صفحة غير موجودة.dc.html`.
 *
 * Next uses two different boundaries for a missing page: a `notFound()` call
 * inside `[locale]` renders `app/[locale]/not-found.tsx`, but an address that
 * matches **no route at all** never enters that segment and lands here. Without
 * this file those URLs got the framework's bare built-in 404 — the wrong design
 * on the page a lost visitor is most likely to meet.
 *
 * It carries its own stylesheet imports and `mia-scope` wrapper because
 * `app/[locale]/layout.tsx` does not run for it; only the root layout does. For
 * the same reason the copy is read from the catalog rather than through
 * next-intl's server APIs, which throw outside the locale segment.
 */

export default async function RootNotFound() {
  let locale = DEFAULT_LOCALE;
  try {
    /* `middleware.ts` writes this onto the request from the URL, so it is
       right on the very first visit, before any response cookie exists. */
    const value = (await cookies()).get("NEXT_LOCALE")?.value;
    if (value && isValidLocale(value)) locale = value;
  } catch {
    /* Keep the default. */
  }

  const messages = messagesFor(locale);
  const system = (messages.system ?? {}) as Record<string, string>;
  const projects = (messages.projects ?? {}) as Record<string, string>;

  return (
    <div className="mia-scope" dir={localeDirection(locale)} lang={locale}>
      <MinbarMessages locale={locale} namespaces={["system"]}>
        <StatusScreen
          tone="neutral"
          icon={NotFoundIcon}
          title={system.notFoundTitleFull}
          lead={system.notFoundLead}
          primary={{ label: system.backHomeCta, href: miaPath("home", locale) }}
          secondary={{ label: projects.allProjects, href: miaPath("projects", locale) }}
          animate
        />
      </MinbarMessages>
    </div>
  );
}
