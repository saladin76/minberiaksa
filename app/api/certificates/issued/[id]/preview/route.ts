import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { manualDocumentHtml, type ManualDocument } from "@/lib/certificates/manual-render";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const record = await prisma.issuedCertificate.findUnique({ where: { id }, select: { document: true } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ html: await manualDocumentHtml(record.document as unknown as ManualDocument, paymentPublicOrigin(request.url)) }, { headers: { "Cache-Control": "no-store" } });
}
