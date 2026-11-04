import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { requestDonorLogin } from "@/lib/auth/donor-login-service";
import { requireLoginOrigin, loginError } from "@/lib/auth/donor-login-request";
import { writeAuditLog } from "@/lib/audit-log";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invitation = await prisma.donorAccountInvitation.findUnique({ where: { id } });
  if (invitation?.status === "SENT" && invitation.sentAt && Date.now() - invitation.sentAt.getTime() > 600_000) invitation.status = "EXPIRED";
  const delivery = invitation?.deliveryId ? await prisma.communicationDelivery.findUnique({ where: { id: invitation.deliveryId }, select: { status: true, errorMessage: true } }) : null;
  return NextResponse.json({ invitation, delivery }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = requireLoginOrigin(request);
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== "DONOR" || user.mergedIntoUserId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { channel } = await request.json();
    if (channel !== "EMAIL" && channel !== "WHATSAPP") throw new Error("INVALID_CONTACT");
    const contact = channel === "EMAIL" ? user.email : user.phone;
    if (!contact) throw new Error("INVALID_CONTACT");
    await requestDonorLogin({ channel, contact, locale: user.preferredLang || "ar", invitationUserId: id, requestKey: `admin:${session!.user.id}` });
    await writeAuditLog({ actorId: session!.user.id, actorRole: "ADMIN", action: "DONOR_LOGIN_INVITATION_SENT", messageAr: "أرسل دعوة دخول لحساب المتبرع", entityType: "User", entityId: id, metadata: { channel } });
    return NextResponse.json({ ok: true, status: "SENT" });
  } catch (error) { return loginError(error); }
}
