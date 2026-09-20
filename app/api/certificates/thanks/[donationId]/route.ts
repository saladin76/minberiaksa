import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { assetBaseUrl, authorizeDonationAccess, documentsOrError, isErrorResponse, pdfErrorResponse, pdfResponse } from "@/lib/certificates/http";
import { generateThanksPdf } from "@/lib/certificates/generate";

/**
 * GET /api/certificates/thanks/:donationId — the thank-you certificate as a PDF
 * (`شهادة الشكر عرضية`, A4 landscape).
 *
 * Reads the certificate the server issued on confirmation — issuing it first
 * if this is the first request after the webhook — and renders it in the
 * locale the donation was made in. No serial is ever computed here.
 *
 * `?name=` carries the name the donor edited on the success page. It is
 * stored on the certificate before rendering, so the download, a later
 * re-download and the emailed copy all say the same name.
 *
 * `?layout=portrait` renders the alternate tall sheet. It is a dashboard
 * option, not a donor one, so it needs the revenue permission.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await params;
  try {
    const docs = await documentsOrError(donationId);
    if (isErrorResponse(docs)) return docs;

    const denied = await authorizeDonationAccess(docs.thanks.donorId);
    if (denied) return denied;

    const edited = request.nextUrl.searchParams.get("name")?.trim().slice(0, 120);
    if (edited && edited !== docs.thanks.donorName) {
      docs.thanks = await prisma.certificate.update({ where: { id: docs.thanks.id }, data: { donorName: edited } });
    }

    let layout: "landscape" | "portrait" = "landscape";
    if (request.nextUrl.searchParams.get("layout") === "portrait") {
      const session = await getServerSession(authOptions);
      if (!userHasDashboardPermission(session?.user, "revenue")) {
        return NextResponse.json({ error: "The portrait layout is a dashboard option" }, { status: 403 });
      }
      layout = "portrait";
    }

    const { pdf, filename } = await generateThanksPdf(docs, await assetBaseUrl(), layout);
    return pdfResponse(pdf, filename, request.nextUrl.searchParams.get("inline") === "1");
  } catch (error) {
    try {
      return pdfErrorResponse(error);
    } catch {
      console.error("[certificates/thanks]", error);
      return NextResponse.json({ error: "Failed to generate the certificate" }, { status: 500 });
    }
  }
}
