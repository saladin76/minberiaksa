import { NextRequest, NextResponse } from "next/server";
import { parseDonationDocumentPathToken } from "@/lib/donations/access-token-link";
import { assetBaseUrl, authorizeDonationAccess, documentsOrError, isErrorResponse, pdfErrorResponse, pdfResponse } from "@/lib/certificates/http";
import { generateReceiptPdf } from "@/lib/certificates/generate";

/**
 * GET /api/receipts/:donationId  the donation receipt as a PDF
 * (`إيصال التبرع`, A4 portrait).
 *
 * The accounting document: the official receipt number the server issued on
 * confirmation, the lines as charged, the verification code. Two pages when
 * the donor's language is not Turkish  theirs, then the Turkish copy the
 * foundation's registration requires  with the same number on both.
 *
 * A bank transfer has a receipt only once a finance officer has matched the
 * money; before that this answers 409, as the spec's §3 requires.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ donationId: string }> }) {
  const { donationId: rawDonationId } = await params;
  const documentPath = parseDonationDocumentPathToken(rawDonationId);
  if (!documentPath) return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  try {
    const denied = await authorizeDonationAccess(documentPath.donationId, request, documentPath.token);
    if (denied) return denied;

    const docs = await documentsOrError(documentPath.donationId);
    if (isErrorResponse(docs)) return docs;

    const { pdf, filename } = await generateReceiptPdf(docs, await assetBaseUrl());
    return pdfResponse(pdf, filename, request.nextUrl.searchParams.get("inline") === "1");
  } catch (error) {
    try {
      return pdfErrorResponse(error);
    } catch {
      console.error("[receipts]", error);
      return NextResponse.json({ error: "Failed to generate the receipt" }, { status: 500 });
    }
  }
}
