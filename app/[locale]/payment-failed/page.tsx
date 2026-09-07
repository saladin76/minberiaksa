import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { FailIcon } from "@/components/minbar/states/StatusIcons";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["system", "cart"] as const;

/**
 * Payment failed — ported from `Minbar/فشل الدفع.dc.html`.
 *
 * The two exits are deliberate: try the payment again, or reach a human. A
 * failed card is most often a bank-side decline the donor can resolve, so
 * retry leads.
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
        icon={FailIcon}
        title={tSystem("failTitle")}
        lead={tSystem("failLead")}
        primary={{ label: tSystem("retry"), href: miaPath("checkout", locale) }}
        secondary={{ label: tNav("contact"), href: miaPath("contact", locale) }}
        animate
      />
    </MinbarMessages>
  );
}
