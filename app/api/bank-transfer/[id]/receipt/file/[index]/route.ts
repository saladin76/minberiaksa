import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isObjectId } from "@/lib/slug";
import { donorMayAccessClaim, findClaimByDonation } from "@/lib/donations/bank-transfer-claims";
import { receiptFileResponse } from "@/lib/donations/receipt-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A receipt the donor uploaded, for the donor: the same access rule as the
 * upload itself (their session, or the claim's `?t=` token). `id` is the
 * donation id, as in the upload route.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params;
  const i = Number(index);
  if (!isObjectId(id) || !Number.isInteger(i) || i < 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const claim = await findClaimByDonation(id);
  if (!claim) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const session = await getServerSession(authOptions);
  if (!donorMayAccessClaim(claim, session?.user?.id, request.nextUrl.searchParams.get("t"))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const file = claim.receipts[i];
  if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return receiptFileResponse(file, { download: request.nextUrl.searchParams.get("download") === "1", logTag: `donor ${id}/${i}` });
}
