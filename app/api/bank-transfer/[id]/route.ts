import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isObjectId } from "@/lib/slug";
import { donorMayAccessClaim, findClaimByDonation } from "@/lib/donations/bank-transfer-claims";
import { serializeClaimForDonor } from "@/lib/donations/bank-transfer-serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The donor's view of their bank transfer — what the status page polls after
 * an upload and what a returning visitor sees. Proof of ownership is the
 * session (owner) or the token from the redirect / emails (guest).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const claim = await findClaimByDonation(id);
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const token = request.nextUrl.searchParams.get("t");
  if (!donorMayAccessClaim(claim, session?.user?.id, token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ claim: serializeClaimForDonor(claim, request.nextUrl.searchParams.get("locale") ?? claim.donation.locale ?? "en") });
}
