import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { ProcessingIcon } from "@/components/minbar/states/StatusIcons";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["system"] as const;

/**
 * Payment processing — ported from `Minbar/معالجة الدفع.dc.html`.
 *
 * Shown while the gateway settles. There is deliberately no retry button: a
 * second attempt during settlement is how a donor gets charged twice.
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

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <StatusScreen
        tone="pending"
        icon={ProcessingIcon}
        title={tSystem("pendingConfirmation")}
        lead={tSystem("gatewayDelayLead")}
        secondary={{ label: tSystem("backHomeCta"), href: miaPath("home", locale) }}
        animate
      />
    </MinbarMessages>
  );
}
