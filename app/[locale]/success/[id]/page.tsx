import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDonationSummary } from "@/lib/minbar/donation";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import SuccessPage from "@/components/minbar/success/SuccessPage";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart", "certificates"] as const;

/**
 * Never indexed: this page belongs to one donation and is reachable by its id.
 * `PRODUCTION_SEO_CONTRACT.md` lists the success screen among the noindex
 * routes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Donation received — ported from `Minbar/نجاح التبرع.dc.html`.
 *
 * This lives at `/success/{id}` rather than at the handoff's own slug because
 * that is the address the payment gateways redirect to on a successful 3-D
 * Secure return (`app/api/payfor/3dpay/ok`, `app/api/albaraka/3d/callback`).
 *
 * An unknown id, or a donation that has not settled, is a 404 rather than a
 * congratulation: a pending bank transfer has its own screen, and telling a
 * donor a payment succeeded when it has not is the one thing this page must
 * never do.
 */
export default async function Success({ params }: Props) {
  const { locale, id } = await params;
  const donation = await getDonationSummary(id, locale);
  if (!donation) notFound();

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <SuccessPage donation={donation} />
    </MinbarMessages>
  );
}
