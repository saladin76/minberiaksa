import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED, CATEGORY_ACTIVE_OR_UNSET } from "@/lib/campaign/soft-delete-filter";

export async function GET() {
  try {
    // Fetch active categories with the first 5 non-soft-deleted campaigns each.
    // Both filters use the comprehensive OR helpers so legacy rows where the
    // boolean field was never written still match.
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
      where: CATEGORY_ACTIVE_OR_UNSET,
      include: {
        campaigns: {
          where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] },
          take: 5,
          select: {
            id: true,
            title: true,
            description: true,
            targetAmount: true,
            currentAmount: true,
            images: true,
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // Format the response to include only necessary data
    const formattedCategories = categories.map(category => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      campaigns: category.campaigns, // Include the first 5 campaigns
    }));

    return NextResponse.json(formattedCategories);
  } catch (error) {
    console.error('Error fetching categories with campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories with campaigns' },
      { status: 500 }
    );
  }
} 