import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAccountSummary } from "@/lib/minbar/account";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import AccountPage from "@/components/minbar/account/AccountPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["account"] as const;

/**
 * Never indexed: this page exists only for the donor signed in to it, and
 * `PRODUCTION_SEO_CONTRACT.md` lists the account among the noindex routes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The donor account — ported from `Minbar/حساب المتبرع.dc.html`.
 *
 * Signed-out visitors are sent to sign in rather than shown an empty account:
 * there is nothing on this page that means anything without a donor behind it.
 * A session whose user no longer exists is treated the same way.
 */
export default async function Account({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(miaPath("account", locale))}`);
  }

  const summary = await getAccountSummary(userId, locale);
  if (!summary) {
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(miaPath("account", locale))}`);
  }

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <AccountPage summary={summary} />
    </MinbarMessages>
  );
}
