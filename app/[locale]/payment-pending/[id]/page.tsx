import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isObjectId } from "@/lib/slug";
import { miaPath } from "@/lib/minbar/routes";
import { banksFor } from "@/lib/minbar/banks-server";
import { donorMayAccessClaim, findClaimByDonation } from "@/lib/donations/bank-transfer-claims";
import { serializeClaimForDonor } from "@/lib/donations/bank-transfer-serializers";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import StatusScreen from "@/components/minbar/states/StatusScreen";
import { FailIcon } from "@/components/minbar/states/StatusIcons";
import TransferReceiptPage from "@/components/minbar/bank-transfer/TransferReceiptPage";

interface Props {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ t?: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["transferReceipt", "cart"] as const;

/**
 * One bank transfer, for its donor: upload the receipt, follow the finance
 * review, collect the receipt once confirmed (`DONATION_LOGIC_SPEC §3`).
 *
 * Reached from the checkout redirect and from every status email, so it
 * carries the whole life of the transfer rather than one moment of it. A
 * guest proves the order is theirs with the `?t=` token; a signed-in donor
 * with their session. Anyone else gets a refusal, not a 404 — the order
 * exists, this link just is not theirs.
 *
 * Never indexed: per-donor, reachable by id (`PRODUCTION_SEO_CONTRACT.md`).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Page({ params, searchParams }: Props) {
  const [{ locale, id }, { t: token }] = await Promise.all([params, searchParams]);
  if (!isObjectId(id)) notFound();

  const [claim, session] = await Promise.all([findClaimByDonation(id), getServerSession(authOptions)]);
  if (!claim) notFound();

  if (!donorMayAccessClaim(claim, session?.user?.id, token ?? null)) {
    const tr = await getTranslations({ locale, namespace: "transferReceipt" });
    const tSystem = await getTranslations({ locale, namespace: "system" });
    const signIn = `/${locale}/auth/signin?callbackUrl=${encodeURIComponent(miaPath("paymentPending", locale, id))}`;
    return (
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <StatusScreen
          tone="error"
          icon={FailIcon}
          title={tSystem("pendingTransferTitle")}
          lead={tr("forbidden")}
          primary={{ label: tr("goToAccount"), href: signIn }}
          secondary={{ label: tSystem("backHomeCta"), href: miaPath("home", locale) }}
        />
      </MinbarMessages>
    );
  }

  const banks = claim.bankSlug ? await banksFor(locale) : [];
  const bank = banks.find((b) => b.id === claim.bankSlug) ?? null;
  const isOwner = Boolean(session?.user?.id && session.user.id === claim.donation.donorId);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <TransferReceiptPage
        claim={serializeClaimForDonor(claim, locale)}
        bank={bank}
        /* An owner's session is proof enough; the token is only forwarded to
           the API when it is what let this visitor in. */
        token={isOwner ? null : (token ?? null)}
        donorName={claim.donation.donor.name}
      />
    </MinbarMessages>
  );
}
