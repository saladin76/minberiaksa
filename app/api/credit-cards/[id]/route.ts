import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";

const headers = { "Cache-Control": "no-store, private" };
function validOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === paymentPublicOrigin(req.url);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!/^[a-f0-9]{24}$/i.test(id) || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["isDefault", "nickname"].includes(key))
    || !Object.keys(body).length || body.isDefault !== undefined && body.isDefault !== true
    || body.nickname !== undefined && (typeof body.nickname !== "string" || body.nickname.trim().length > 80))
    return NextResponse.json({ error: "INVALID_CARD_UPDATE" }, { status: 400 });
  try {
    const card = await prisma.$transaction(async tx => {
      const owned = await tx.creditCard.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
      if (!owned) throw new Error("NOT_FOUND");
      if (body.isDefault) await tx.creditCard.updateMany({ where: { userId: session.user.id }, data: { isDefault: false } });
      // Never serialize the stored PAN, even in encrypted form, or the legacy CVC field.
      return tx.creditCard.update({ where: { id }, data: {
        ...(body.isDefault === true ? { isDefault: true } : {}),
        ...(body.nickname !== undefined ? { nickname: body.nickname.trim() || null } : {}),
      }, select: { id: true, nickname: true, isDefault: true } });
    });
    return NextResponse.json({ card }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "NOT_FOUND" ? "NOT_FOUND" : "CARD_UPDATE_UNAVAILABLE" }, { status: error instanceof Error && error.message === "NOT_FOUND" ? 404 : 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    await prisma.$transaction(async tx => {
      const card = await tx.creditCard.findFirst({ where: { id, userId: session.user.id }, select: { id: true, isDefault: true } });
      if (!card) throw new Error("NOT_FOUND");
      const [linked, pending] = await Promise.all([
        tx.subscription.count({ where: { paymentCardId: id } }),
        tx.subscriptionCardVerification.count({ where: { paymentCardId: id, status: "PENDING", expiresAt: { gt: new Date() } } }),
      ]);
      if (linked || pending) throw new Error("CARD_IN_USE");
      await tx.creditCard.delete({ where: { id } });
      if (card.isDefault) {
        const next = await tx.creditCard.findFirst({ where: { userId: session.user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
        if (next) await tx.creditCard.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: reason === "CARD_IN_USE" || reason === "NOT_FOUND" ? reason : "CARD_DELETE_UNAVAILABLE" }, { status: reason === "CARD_IN_USE" ? 409 : reason === "NOT_FOUND" ? 404 : 503 });
  }
}
