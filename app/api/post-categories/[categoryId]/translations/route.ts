import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

// Admin-only: returns every locale's copy for a category regardless of publication state.
// Guarded with "blog", matching app/api/post-categories/[categoryId]/route.ts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const { categoryId } = await params;

    const translations = await prisma.postCategoryTranslation.findMany({
      where: { categoryId },
      select: { locale: true, name: true, title: true, description: true, image: true }
    });

    return NextResponse.json(translations);
  } catch (error) {
    console.error('Error fetching post category translations:', error);
    return NextResponse.json({ error: 'Failed to fetch translations' }, { status: 500 });
  }
}