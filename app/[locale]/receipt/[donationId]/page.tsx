import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { receiptPagesFor } from "@/lib/certificates/documents";
import { donationAccess } from "@/lib/certificates/http";
import { miaPath } from "@/lib/minbar/routes";
import ReceiptSheet, { RECEIPT_RESPONSIVE_CSS } from "@/components/minbar/certificates/ReceiptSheet";
import DocumentPage from "@/components/minbar/certificates/DocumentPage";

interface Props {
  params: Promise<{ locale: string; donationId: string }>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* `إيصال التبرع.dc.html`: A4 portrait at 194mm, one page per language copy. */
const PRINT_CSS = `
${RECEIPT_RESPONSIVE_CSS}
.rcp-page + .rcp-page { margin-top: 28px; }
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  .rcp-page { break-after: page; }
  .rcp-page:last-child { break-after: auto; }
  .rcp-page + .rcp-page { margin-top: 0; }
  .rcp-sheet { width: 194mm !important; max-width: none !important; margin: 0 !important; box-shadow: none !important; break-inside: avoid; }
}`;

/**
 * The donation receipt as its own page: the donor-language copy and, beneath
 * it, the Turkish copy the foundation's registration requires — the same
 * number and verification code on both, as they are one receipt.
 */
export default async function ReceiptPage({ params }: Props) {
  const { locale, donationId } = await params;

  const docs = await ensureDonationDocuments(donationId);
  if (!docs) notFound();
  const access = await donationAccess(docs.thanks.donorId);
  if (!access.allowed) notFound();

  const pages = await receiptPagesFor(docs);
  const t = await getTranslations({ locale: docs.locale, namespace: "certificates" });

  return (
    <DocumentPage
      printCss={PRINT_CSS}
      actions={[
        { label: t("savePdfReceipt"), href: `/api/receipts/${docs.donationId}`, primary: true, download: true },
        { label: t("printDocument"), kind: "print" },
        { label: t("back"), href: `${miaPath("donationSuccess", locale)}/${docs.donationId}` },
      ]}
    >
      {pages.map((doc) => (
        <div key={doc.locale} className="rcp-page" lang={doc.locale} dir={doc.dir}>
          <ReceiptSheet
            copy={doc.copy}
            org={doc.org}
            receiptNo={doc.receiptNo}
            issueDate={doc.issueDate}
            payMethod={doc.payMethod}
            payStatus={doc.payStatus}
            donorName={doc.donorName}
            donorContact={doc.donorContact}
            lines={doc.lines}
            totalAmount={doc.totalAmount}
            verifyCode={doc.verifyCode}
            copyOf={doc.copyOf}
            pairNote={doc.pairNote}
            dir={doc.dir}
          />
        </div>
      ))}
    </DocumentPage>
  );
}
