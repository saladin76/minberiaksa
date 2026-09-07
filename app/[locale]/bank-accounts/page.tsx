import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { banksFor } from "@/lib/minbar/banks";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import BankAccountsPage from "@/components/minbar/banks/BankAccountsPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return buildPageMetadata(locale, {
    title: t("bankPageTitle"),
    description: t("bankPageLead").slice(0, 165),
    path: `/${slugFor("bankAccounts", locale)}`,
  });
}

/**
 * Bank accounts — ported from `Minbar/الحسابات البنكية.dc.html`.
 *
 * Indexable: the handoff lists this among the public pages, and a donor
 * searching for the association's IBAN should find the association's own page
 * rather than a third-party copy of it.
 */
export default async function BankAccounts({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <BankAccountsPage banks={banksFor(locale)} />
    </MinbarMessages>
  );
}
