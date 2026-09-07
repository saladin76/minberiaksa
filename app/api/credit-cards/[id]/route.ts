import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";

// PATCH /api/credit-cards/[id] — set as default or update nickname
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { isDefault?: boolean; nickname?: string };

  const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.isDefault) {
    await prisma.creditCard.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.creditCard.update({
    where: { id },
    data: {
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      ...(body.nickname !== undefined && { nickname: body.nickname }),
    },
  });

  return NextResponse.json({ card: updated });
}

// DELETE /api/credit-cards/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.creditCard.delete({ where: { id } });

  // If deleted card was default, promote the newest remaining card
  if (card.isDefault) {
    const next = await prisma.creditCard.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    if (next) await prisma.creditCard.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return NextResponse.json({ success: true });
}
