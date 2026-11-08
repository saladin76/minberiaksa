import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDonationSummary } from "@/lib/minbar/donation";
import { donationPageOutcome } from "@/lib/minbar/donation-outcome";
import { isObjectId } from "@/lib/slug";
import { prisma } from "@/lib/prisma";
import { withDonationToken } from "@/lib/donations/access-token-link";
import { messagesFor } from "@/i18n/locale-messages";
import { verseBlock } from "@/lib/minbar/quran";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { successDocumentsFor } from "@/lib/certificates/documents";
import { reconcileStripeDonation } from "@/lib/donations/reconcile-stripe-donation";
import { donationAccess } from "@/lib/certificates/http";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import SuccessPage from "@/components/minbar/success/SuccessPage";

interface Props {
  params: Promise<{ locale: string; id: string }>;
  /** `t`  the guest's access token the gateway redirect / checkout appended. */
  searchParams: Promise<{ t?: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart", "certificates", "quran", "Recurring"] as const;

/**
 * Never indexed: this page belongs to one donation and is reachable by its id.
 * `PRODUCTION_SEO_CONTRACT.md` lists the success screen among the noindex
 * routes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Donation received  ported from `Minbar/نجاح التبرع.dc.html`.
 *
 * This lives at `/success/{id}` rather than at the handoff's own slug because
 * that is the address the payment gateways redirect to on a successful 3-D
 * Secure return (`app/api/payfor/3dpay/ok`, `app/api/albaraka/3d/callback`).
 *
 * An unknown id, or a donation that has not settled, is a 404 rather than a
 * congratulation: a pending bank transfer has its own screen, and telling a
 * donor a payment succeeded when it has not is the one thing this page must
 * never do.
 *
 * The documents (`CERTIFICATES_DOWNLOADS_HANDOFF §5`) are issued here on the
 * server the first time a confirmed donation is shown  the same records the
 * PDF endpoints and the email read, so a reload never mints a second serial.
 * A Stripe donor usually arrives before the webhook; the reconcile call
 * confirms with Stripe directly so the certificate is not a page-refresh away.
 */
export default async function Success({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const { t: token } = await searchParams;
  // The donation ID is not a credential. Check access before reaching a provider
  // or revealing any payment outcome; malformed legacy links stay a 404.
  if (!isObjectId(id)) notFound();
  const access = await donationAccess(id, token);
  if (!access.allowed) notFound();

  // Existing Stripe inquiry can settle a succeeded PaymentIntent idempotently.
  // Never initiate a fresh charge or infer settlement from a browser redirect.
  await reconcileStripeDonation(id).catch(() => undefined);
  const row = await prisma.donation.findUnique({
    where: { id },
    select: { status: true, paidAt: true, provider: true },
  });
  const outcome = donationPageOutcome(row);
  if (outcome === "NOT_FOUND") notFound();
  if (outcome === "PENDING_PAYMENT" || outcome === "INCONSISTENT") {
    redirect(withDonationToken(
      `/${locale}/payment-processing?donationId=${encodeURIComponent(id)}`,
      token,
    ));
  }
  if (outcome === "PENDING_TRANSFER") {
    redirect(`/${locale}/payment-pending`);
  }
  if (outcome === "FAILED") {
    redirect(withDonationToken(
      `/${locale}/donation-failed?donationId=${encodeURIComponent(id)}`,
      token,
    ));
  }

  const donation = await getDonationSummary(id, locale);
  if (!donation) notFound();

  const issued = await ensureDonationDocuments(id).catch((error) => {
    console.error("[success] issuing documents failed:", error);
    return null;
  });
  const documents = await successDocumentsFor(id, issued);

  /* Al-Baqarah 261, resolved on the server so it is in the HTML. */
  const quran = messagesFor(locale).quran as Parameters<typeof verseBlock>[0];

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <SuccessPage donation={donation} verse={verseBlock(quran, "baqarah_261", locale)} documents={documents} accessToken={token ?? null} />
    </MinbarMessages>
  );
}
