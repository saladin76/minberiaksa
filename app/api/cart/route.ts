import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";

// Get cart items for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const cartItems = await prisma.cartItem.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            images: true,
            shareLabels: true,
            translations: {
              select: { locale: true, title: true },
            },
          },
        },
      },
    });

    return NextResponse.json(cartItems);
  } catch (error) {
    console.error("Error fetching cart items:", error);
    return NextResponse.json(
      { error: "Failed to fetch cart items" },
      { status: 500 }
    );
  }
}

// Add item to cart
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const data = await request.json();
    const { campaignId, amount, currency, amountUSD, shareCount } = data;

    // Validate input
    if (!campaignId || amount <= 0 || !currency || !amountUSD) {
      return NextResponse.json(
        { error: "Valid campaign ID, currency, amountUSD, and amount are required" },
        { status: 400 }
      );
    }

    const sc =
      shareCount != null && Number(shareCount) > 0
        ? Math.floor(Number(shareCount))
        : undefined;

    const newCartItem = await prisma.cartItem.create({
      data: {
        campaignId,
        amount,
        amountUSD,
        currency,
        userId: session.user.id,
        ...(sc != null ? { shareCount: sc } : {}),
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            images: true,
            shareLabels: true,
            translations: {
              select: { locale: true, title: true },
            },
          },
        },
      },
    });

    return NextResponse.json(newCartItem, { status: 201 });
  } catch (error) {
    console.error("Error adding item to cart:", error);
    return NextResponse.json(
      { error: "Failed to add item to cart" },
      { status: 500 }
    );
  }
}