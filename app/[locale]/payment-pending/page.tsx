import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { PendingIcon } from "@/components/minbar/states/StatusIcons";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["system"] as const;

/**
 * Bank transfer awaiting confirmation — ported from
 * `Minbar/الدفع قيد التأكيد.dc.html`.
 *
 * A transfer sits here until a finance officer matches the money actually
 * received against the donor's receipt (`DONATION_LOGIC_SPEC §3`). Only then
 * does it become Confirmed, and only then is a certificate issued.
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
        icon={PendingIcon}
        title={tSystem("pendingTransferTitle")}
        lead={tSystem("pendingTransferLead")}
        primary={{ label: tSystem("trackStatus"), href: miaPath("account", locale) }}
        secondary={{ label: tSystem("backHomeCta"), href: miaPath("home", locale) }}
      />
    </MinbarMessages>
  );
}
