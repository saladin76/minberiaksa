import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { encryptCard, detectCardType, decryptCard } from "@/lib/card-crypto";
import { checkCardFields } from "@/lib/minbar/card-validation";

// GET /api/credit-cards  list user's saved cards (masked)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.creditCard.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { id: true, cardNumber: true, cardType: true, expiryDate: true, cardholderName: true, isDefault: true, nickname: true, createdAt: true },
  });

  const masked = cards.map((c) => {
    let last4 = "****";
    try {
      const plain = decryptCard(c.cardNumber);
      last4 = plain.replace(/\s/g, "").slice(-4);
    } catch {}
    return {
      id: c.id,
      last4,
      cardType: c.cardType,
      expiryDate: c.expiryDate,
      cardholderName: c.cardholderName,
      isDefault: c.isDefault,
      nickname: c.nickname,
      createdAt: c.createdAt,
    };
  });

  return NextResponse.json({ cards: masked }, { headers: { "Cache-Control": "no-store, private" } });
}

// POST /api/credit-cards  save a new card
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.cardNumber !== "string" || body.cardNumber.length > 32
    || typeof body.expiryDate !== "string" || body.expiryDate.length > 7
    || typeof body.cvc !== "string" || body.cvc.length > 4
    || (body.cardholderName !== undefined && (typeof body.cardholderName !== "string" || body.cardholderName.length > 120))
    || (body.nickname !== undefined && (typeof body.nickname !== "string" || body.nickname.length > 80))
    || (body.setAsDefault !== undefined && typeof body.setAsDefault !== "boolean")) {
    return NextResponse.json({ error: "cardNumber, expiryDate, and cvc are required" }, { status: 400 });
  }
  const { cardNumber, expiryDate, cvc, cardholderName, nickname, setAsDefault } = body as { cardNumber: string; expiryDate: string; cvc: string; cardholderName?: string; nickname?: string; setAsDefault?: boolean };

  const clean = cardNumber.replace(/\s/g, "");
  if (checkCardFields(clean, expiryDate, cvc)) {
    return NextResponse.json({ error: "Invalid card number" }, { status: 400 });
  }

  const cardType = detectCardType(clean);
  const encryptedNumber = encryptCard(clean);

  // Compare all matching expiries, not just the first saved card. A suffix is
  // not an identity: two different cards can share their last digits.
  const candidates = await prisma.creditCard.findMany({
    where: { userId: session.user.id, expiryDate },
    select: { id: true, cardNumber: true },
  });
  for (const existing of candidates) {
    try {
      const existingPlain = decryptCard(existing.cardNumber);
      if (existingPlain.replace(/\D/g, "") === clean) {
        return NextResponse.json({ card: { id: existing.id }, alreadySaved: true });
      }
    } catch {}
  }

  // If setAsDefault, unset all others first
  if (setAsDefault) {
    await prisma.creditCard.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  // If this is the first card, make it default automatically
  const count = await prisma.creditCard.count({ where: { userId: session.user.id } });
  const isDefault = setAsDefault || count === 0;

  const card = await prisma.creditCard.create({
    data: {
      userId: session.user.id,
      cardNumber: encryptedNumber,
      cardType,
      expiryDate,
      // PCI DSS 3.3.1: the security code is checked for presence only and never kept.
      cvc: "",
      cardholderName: cardholderName?.trim() || null,
      nickname: nickname?.trim() || null,
      isDefault,
    },
  });

  const plain = decryptCard(card.cardNumber);
  return NextResponse.json({
    card: {
      id: card.id,
      last4: plain.slice(-4),
      cardType: card.cardType,
      expiryDate: card.expiryDate,
      cardholderName: card.cardholderName,
      isDefault: card.isDefault,
      nickname: card.nickname,
    },
  });
}
