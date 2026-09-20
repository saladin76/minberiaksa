import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetBaseUrl, authorizeDonationAccess, pdfErrorResponse, pdfResponse } from "@/lib/certificates/http";
import { findWaqfCertificate } from "@/lib/certificates/documents";
import { generateWaqfPdf } from "@/lib/certificates/generate";

/**
 * GET /api/certificates/waqf/:certificateId — one waqf certificate as a PDF
 * (`شهادة الاوقاف`: the certificate face and the presentation panel on one A4
 * landscape sheet).
 *
 * The certificate exists only because the server issued it after the payment
 * was confirmed, so there is nothing to issue here: an unknown id is a 404.
 * Its number was assigned once from the per-unit book and is printed as is.
 *
 * `?name=` stores the endower's name as the donor corrected it on the success
 * page, the same way the thank-you endpoint does.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  try {
    let cert = await findWaqfCertificate(certificateId);
    if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

    const denied = await authorizeDonationAccess(cert.donation.donorId);
    if (denied) return denied;

    const edited = request.nextUrl.searchParams.get("name")?.trim().slice(0, 120);
    if (edited && edited !== cert.donorName) {
      const updated = await prisma.certificate.update({ where: { id: cert.id }, data: { donorName: edited } });
      cert = { ...cert, ...updated };
    }

    const { pdf, filename } = await generateWaqfPdf(cert, await assetBaseUrl());
    return pdfResponse(pdf, filename, request.nextUrl.searchParams.get("inline") === "1");
  } catch (error) {
    try {
      return pdfErrorResponse(error);
    } catch {
      console.error("[certificates/waqf]", error);
      return NextResponse.json({ error: "Failed to generate the certificate" }, { status: 500 });
    }
  }
}
