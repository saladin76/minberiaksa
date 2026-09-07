import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { CancelIcon } from "@/components/minbar/states/StatusIcons";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["system", "cart"] as const;

/**
 * Payment cancelled — ported from `Minbar/إلغاء الدفع.dc.html`.
 *
 * The donor stepped back rather than failed, so the tone is neutral and the
 * basket is kept: returning to it is the primary exit.
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
        tone="neutral"
        icon={CancelIcon}
        title={tSystem("paymentCancelled")}
        lead={tSystem("cancelLeadFull")}
        primary={{ label: tSystem("returnToCart"), href: miaPath("cart", locale) }}
        secondary={{ label: tSystem("backHomeCta"), href: miaPath("home", locale) }}
      />
    </MinbarMessages>
  );
}
