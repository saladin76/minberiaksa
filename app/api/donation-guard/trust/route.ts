import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { donationAccess } from "@/lib/certificates/http";
import { issueTrustMark, TRUST_COOKIE, TRUST_TTL_DAYS } from "@/lib/site-security/donation-trust";

export const dynamic = "force-dynamic";
/**
 * Marks this browser as a verified previous donor after a PAID donation it may access.
 * Same reply whatever happens, so it reveals nothing about donations.
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  try {
    const body = (await request.json().catch(() => null)) as { donationId?: unknown; token?: unknown } | null;
    const id = typeof body?.donationId === "string" ? body.donationId : "";
    const token = typeof body?.token === "string" ? body.token : undefined;
    if (!/^[a-f\d]{24}$/i.test(id)) return res;
    const access = await donationAccess(id, token);
    if (!access.allowed) return res;
    const row = await prisma.donation.findUnique({ where: { id }, select: { status: true, paidAt: true } });
    if (row?.status !== "PAID" || !row.paidAt) return res;
    const secret = process.env.DONATION_ABUSE_HASH_SECRET || process.env.NEXTAUTH_SECRET || "";
    res.cookies.set(TRUST_COOKIE, issueTrustMark(Date.now(), secret), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TRUST_TTL_DAYS * 86400 });
  } catch (error) {
    console.error("[donation-guard] trust mark not issued:", error instanceof Error ? error.message : "unknown");
  }
  return res;
}
