import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { thanksDocumentFor } from "@/lib/certificates/documents";
import { donationAccess } from "@/lib/certificates/http";
import { miaPath } from "@/lib/minbar/routes";
import ThanksCertificate from "@/components/minbar/certificates/ThanksCertificate";
import ThanksCertificatePortrait from "@/components/minbar/certificates/ThanksCertificatePortrait";
import DocumentPage from "@/components/minbar/certificates/DocumentPage";

interface Props {
  params: Promise<{ locale: string; donationId: string }>;
  searchParams: Promise<{ layout?: string }>;
}

/** Per-donor, reachable by id: never indexed (`PRODUCTION_SEO_CONTRACT.md`). */
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LANDSCAPE_PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 0; }
  .cert-sheet { box-shadow: none !important; margin: 0 !important; width: 296mm !important; height: 209mm !important; max-width: none !important; aspect-ratio: auto !important; break-inside: avoid; overflow: hidden; }
  .cert-body { grid-template-rows: auto auto 1fr auto !important; }
  .cert-main { align-content: center !important; }
}`;

const PORTRAIT_PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  .cert-sheet { box-shadow: none !important; margin: 0 !important; width: 209mm !important; height: 295mm !important; max-width: none !important; aspect-ratio: auto !important; break-inside: avoid; overflow: hidden; }
}`;

/**
 * The thank-you certificate as its own page — `شهادة الشكر عرضية.dc.html`:
 * the sheet, and beneath it the save-as-PDF and print buttons that never
 * print. The certificate renders in the language the donation was made in,
 * whatever the URL's locale, because it is that donor's document.
 *
 * `?layout=portrait` — the alternate tall sheet — is offered to staff only.
 */
export default async function ThanksCertificatePage({ params, searchParams }: Props) {
  const { locale, donationId } = await params;
  const { layout } = await searchParams;

  const docs = await ensureDonationDocuments(donationId);
  if (!docs) notFound();
  const access = await donationAccess(docs.thanks.donorId);
  if (!access.allowed) notFound();

  const doc = await thanksDocumentFor(docs);
  const portrait = layout === "portrait" && access.admin;
  const t = await getTranslations({ locale: doc.locale, namespace: "certificates" });

  const props = { donorName: doc.donorName, copy: doc.copy, verse: doc.verse, duaVerse: doc.duaVerse, dir: doc.dir };
  const pdfHref = `/api/certificates/thanks/${docs.donationId}${portrait ? "?layout=portrait" : ""}`;

  return (
    <DocumentPage
      printCss={portrait ? PORTRAIT_PRINT_CSS : LANDSCAPE_PRINT_CSS}
      actions={[
        { label: t("savePdfCert"), href: pdfHref, primary: true, download: true },
        { label: t("printDocument"), kind: "print" },
        ...(access.admin
          ? [{ label: portrait ? t("landscapeVersion") : t("portraitVersion"), href: `${miaPath("thanksCertificate", locale, docs.donationId)}${portrait ? "" : "?layout=portrait"}` }]
          : []),
        { label: t("back"), href: `${miaPath("donationSuccess", locale)}/${docs.donationId}` },
      ]}
    >
      {portrait ? <ThanksCertificatePortrait {...props} /> : <ThanksCertificate {...props} />}
    </DocumentPage>
  );
}
