import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { giftCertificateToken, giftCertificateTokenMatches } from "@/lib/donations/gift-certificate-token";
import { authorizeDonationAccess, pdfErrorResponse } from "@/lib/certificates/http";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { generateWaqfPdf } from "@/lib/certificates/generate";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { waqfGiftScope } from "@/lib/donations/waqf-gift-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The recipient's waqf certificate: opened with their gift link, or by anyone allowed to see the donation. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const item = await prisma.donationWaqfItem.findUnique({ where: { id }, include: { donation: { select: { id: true, paidAt: true, accessToken: true } } } });
  if (!item?.giftRecipientName || !item.donation.paidAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const giftAccess = giftCertificateTokenMatches(giftCertificateToken(waqfGiftScope(id), item.donationId, item.donation.accessToken), request.nextUrl.searchParams.get("giftToken"));
  if (!giftAccess) {
    const denied = await authorizeDonationAccess(item.donationId, request);
    if (denied) return denied;
  }
  try {
    const docs = await ensureDonationDocuments(item.donationId);
    const cert = docs?.waqf.find((c) => c.waqfItem.id === id);
    if (!cert) return NextResponse.json({ error: "Certificate unavailable" }, { status: 503 });
    const pdf = await generateWaqfPdf(cert, paymentPublicOrigin(request.url));
    return new NextResponse(new Uint8Array(pdf.pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="waqf-gift-certificate.pdf"; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
      "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return pdfErrorResponse(error); }
}
