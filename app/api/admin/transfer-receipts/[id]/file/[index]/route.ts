import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/slug";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { receiptExtension } from "@/lib/uploads/receipt-file-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One uploaded transfer receipt, served with its real type and name.
 *
 * Cloudinary delivers raw files (PDFs) as `application/octet-stream` with a
 * forced download, and older uploads have no extension at all, so the
 * dashboard's viewer could neither show them nor save them as a PDF. This
 * streams the stored file back inline with the MIME type recorded at upload
 * and the donor's original file name; `?download=1` saves it instead.
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

  const upstream = await fetch(file.url, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });

  const ext = receiptExtension(file.mimeType, file.fileName);
  const base = (file.fileName || "receipt").replace(/\.[^.]+$/, "") || "receipt";
  const name = `${base}${ext}`;
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
