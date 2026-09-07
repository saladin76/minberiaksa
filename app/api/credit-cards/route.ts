import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { encryptCard, hashCvc, detectCardType, decryptCard } from "@/lib/card-crypto";

// GET /api/credit-cards — list user's saved cards (masked)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.creditCard.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
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

  return NextResponse.json({ cards: masked });
}

// POST /api/credit-cards — save a new card
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    cardNumber: string;
    expiryDate: string;
    cvc: string;
    cardholderName?: string;
    nickname?: string;
    setAsDefault?: boolean;
  };

  const { cardNumber, expiryDate, cvc, cardholderName, nickname, setAsDefault } = body;

  if (!cardNumber || !expiryDate || !cvc) {
    return NextResponse.json({ error: "cardNumber, expiryDate, and cvc are required" }, { status: 400 });
  }

  const clean = cardNumber.replace(/\s/g, "");
  if (clean.length < 13 || clean.length > 19) {
    return NextResponse.json({ error: "Invalid card number" }, { status: 400 });
  }

  const cardType = detectCardType(clean);
  const encryptedNumber = encryptCard(clean);
  const hashedCvc = await hashCvc(cvc);

  // Check for duplicate (same last 8 digits + expiry is a good proxy)
  const last8 = clean.slice(-8);
  const existing = await prisma.creditCard.findFirst({
    where: { userId: session.user.id, expiryDate },
  });
  if (existing) {
    try {
      const existingPlain = decryptCard(existing.cardNumber);
      if (existingPlain.slice(-8) === last8) {
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
      cvc: hashedCvc,
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
