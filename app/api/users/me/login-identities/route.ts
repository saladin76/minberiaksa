import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireLoginOrigin, loginError } from "@/lib/auth/donor-login-request";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const identities = await prisma.donorLoginIdentity.findMany({ where: { userId: session.user.id }, select: { id: true, channel: true, contact: true, verifiedAt: true } });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (user?.email && user.emailVerified && !identities.some(i => i.channel === "EMAIL" && i.contact === user.email!.toLowerCase())) identities.unshift({ id: `EMAIL:${user.email.toLowerCase()}`, channel: "EMAIL", contact: user.email.toLowerCase(), verifiedAt: user.emailVerified });
  return NextResponse.json({ identities, primaryEmail: user?.email }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const blocked = requireLoginOrigin(request);
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "DONOR") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { identityId } = await request.json();
    await prisma.$transaction(async tx => {
      const identity = await tx.donorLoginIdentity.findUnique({ where: { id: String(identityId) } });
      if (!identity || identity.userId !== session.user.id || identity.channel !== "EMAIL") throw new Error("ACCOUNT_CONFLICT");
      const current = await tx.user.findUniqueOrThrow({ where: { id: session.user.id } });
      if (current.email && current.emailVerified) {
        const oldId = `EMAIL:${current.email.toLowerCase()}`;
        const old = await tx.donorLoginIdentity.findUnique({ where: { id: oldId } });
        if (old && old.userId !== current.id) throw new Error("ACCOUNT_CONFLICT");
        if (!old) await tx.donorLoginIdentity.create({ data: { id: oldId, userId: current.id, channel: "EMAIL", contact: current.email.toLowerCase(), verifiedAt: current.emailVerified } });
      }
      await tx.user.update({ where: { id: session.user.id }, data: { email: identity.contact, emailVerified: identity.verifiedAt } });
      await tx.donorCommunicationProfile.updateMany({ where: { userId: session.user.id }, data: { email: identity.contact } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return loginError(error); }
}
