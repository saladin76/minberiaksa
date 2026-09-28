import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/slug";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { receiptFileResponse } from "@/lib/donations/receipt-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One uploaded transfer receipt for the finance dashboard, shown inline with
 * its real type and name (`?download=1` saves it instead). See
 * `receiptFileResponse` for why the public Cloudinary URL cannot be used.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;

  const { id, index } = await params;
  const i = Number(index);
  if (!isObjectId(id) || !Number.isInteger(i) || i < 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const claim = await prisma.bankTransferClaim.findUnique({ where: { id }, select: { receipts: true } });
  const file = claim?.receipts[i];
  if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return receiptFileResponse(file, { download: request.nextUrl.searchParams.get("download") === "1", logTag: `admin ${id}/${i}` });
}
