import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { findWaqfCertificate, waqfDocumentFor } from "@/lib/certificates/documents";
import { donationAccess } from "@/lib/certificates/http";
import { withDonationToken } from "@/lib/donations/access-token";
import { miaPath } from "@/lib/minbar/routes";
import WaqfCertificateSheet from "@/components/minbar/certificates/WaqfCertificateSheet";
import DocumentPage from "@/components/minbar/certificates/DocumentPage";

interface Props {
  params: Promise<{ locale: string; certificateId: string }>;
  /** `t` — the guest's access token, carried on from the success page. */
  searchParams: Promise<{ t?: string }>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* `شهادة الاوقاف.dc.html`: the two panels side by side on one A4 landscape
   sheet in print; on a narrow screen they stack. */
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 4mm; }
  .waqf-pair { width: 289mm !important; height: 202mm !important; grid-template-columns: 1fr 1fr !important; max-width: none !important; aspect-ratio: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; align-items: center !important; break-inside: avoid; overflow: hidden; }
  .waqf-pair > .waqf-sheet { grid-column: 1 !important; grid-row: 1 !important; }
  .waqf-pair > .waqf-back { grid-column: 2 !important; grid-row: 1 !important; }
}
@media screen and (max-width: 760px) {
  .waqf-pair { grid-template-columns: minmax(0,1fr) !important; aspect-ratio: auto !important; gap: 26px !important; padding: 16px !important; }
  .waqf-pair > .waqf-sheet { grid-column: 1 !important; grid-row: 1 !important; }
  .waqf-pair > .waqf-back { grid-column: 1 !important; grid-row: 2 !important; }
}`;

/**
 * One waqf certificate as its own page. The number on it is the one the
 * server issued after payment; there is no preview state here — a
 * certificate that does not exist is a 404.
 */
export default async function WaqfCertificatePage({ params, searchParams }: Props) {
  const { locale, certificateId } = await params;
  const { t: token } = await searchParams;

  const cert = await findWaqfCertificate(certificateId);
  if (!cert) notFound();
  const access = await donationAccess(cert.donationId, token);
  if (!access.allowed) notFound();

  const doc = await waqfDocumentFor(cert);
  const t = await getTranslations({ locale: doc.locale, namespace: "certificates" });

  return (
    <DocumentPage
      printCss={PRINT_CSS}
      actions={[
        { label: t("savePdfCert"), href: withDonationToken(`/api/certificates/waqf/${cert.id}`, token), primary: true, download: true },
        { label: t("printDocument"), kind: "print" },
        { label: t("back"), href: withDonationToken(`${miaPath("donationSuccess", locale)}/${cert.donationId}`, token) },
      ]}
    >
      <WaqfCertificateSheet
        unit={doc.unit}
        count={doc.count}
        total={doc.total}
        donorName={doc.donorName}
        onBehalf={doc.onBehalf}
        certNo={doc.certNo}
        certDate={doc.certDate}
        copy={doc.copy}
        locale={doc.locale}
        dir={doc.dir}
      />
    </DocumentPage>
  );
}
