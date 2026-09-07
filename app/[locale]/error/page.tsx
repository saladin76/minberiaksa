import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { TechErrorIcon } from "@/components/minbar/states/StatusIcons";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["system"] as const;

/**
 * Technical error — ported from `Minbar/خطأ تقني.dc.html`.
 *
 * For a fault on our side. It offers a way home and a way to reach us, and
 * says nothing about what went wrong internally.
 *
 * Never indexed: a status screen has no standalone meaning in search, and
 * `PRODUCTION_SEO_CONTRACT.md` lists the payment states as noindex.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  const tSystem = await getTranslations({ locale, namespace: "system" });
  const tNav = await getTranslations({ locale, namespace: "navigation" });

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <StatusScreen
        tone="error"
        icon={TechErrorIcon}
        title={tSystem("techErrorTitle")}
        lead={tSystem("techErrorLead")}
        primary={{ label: tSystem("backHomeCta"), href: miaPath("home", locale) }}
        secondary={{ label: tNav("contact"), href: miaPath("contact", locale) }}
      />
    </MinbarMessages>
  );
}
