import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { prisma } from "@/lib/prisma";
import { issuedDocumentTokenMatches, manualDocumentPdf, type ManualDocument } from "@/lib/certificates/manual-render";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { pdfErrorResponse } from "@/lib/certificates/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!issuedDocumentTokenMatches(id, request.nextUrl.searchParams.get("token"))) {
    const session = await getServerSession(authOptions);
    if (!userHasDashboardPermission(session?.user, "siteContent")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await prisma.issuedCertificate.findUnique({ where: { id }, select: { document: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const generated = await manualDocumentPdf(row.document as unknown as ManualDocument, paymentPublicOrigin(request.url));
    return new NextResponse(new Uint8Array(generated.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${generated.filename}"`, "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) { return pdfErrorResponse(error); }
}
