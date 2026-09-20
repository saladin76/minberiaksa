import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { isObjectId } from "@/lib/slug";
import {
  annotateBankTransferClaim,
  confirmBankTransferClaim,
  findClaimByDonation,
  findClaimById,
  rejectBankTransferClaim,
} from "@/lib/donations/bank-transfer-claims";
import { serializeClaimForAdmin } from "@/lib/donations/bank-transfer-serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  /* Either id opens the review: the claim's own, or the donation's — which is
     what the donations table and the Telegram card have to hand. */
  const claim = (await findClaimById(id)) ?? (await findClaimByDonation(id));
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ claim: serializeClaimForAdmin(claim) });
}

/**
 * The finance decision. `action` is one of:
 *  - `confirm`: the money is on the statement → settle the donation.
 *  - `reject`:  it is not → tell the donor why (`reason` required).
 *  - `note`:    save an internal note; no state change.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | { action?: string; reason?: string; adminNote?: string | null }
    | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const actor = auditActorFromDashboardSession(session!);
  const origin = await getServerBaseUrl();
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : body.adminNote === null ? null : undefined;

  if (body.action === "note") {
    await annotateBankTransferClaim(id, adminNote ?? null);
    const claim = await findClaimById(id);
    if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ claim: serializeClaimForAdmin(claim) });
  }

  if (body.action === "confirm") {
    const result = await confirmBankTransferClaim(id, actor, { adminNote, origin });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.reason === "NOT_FOUND" ? 404 : 409 });
    }
    return NextResponse.json({ claim: serializeClaimForAdmin(result.claim) });
  }

  if (body.action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
    const result = await rejectBankTransferClaim(id, actor, { reason: reason.slice(0, 600), adminNote, origin });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.reason === "NOT_FOUND" ? 404 : 409 });
    }
    return NextResponse.json({ claim: serializeClaimForAdmin(result.claim) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
