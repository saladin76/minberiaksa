import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

// GET /api/posts/[postId]/translations - return all translations for a post
//
// Admin-only: this returns EVERY locale's title/description/content for a post regardless of
// publication state, so unauthenticated it leaked unpublished drafts to anyone who could guess
// or scrape a post id. Guarded with "blog", matching every sibling route in app/api/posts.
//
// Also switched from a locally-constructed `new PrismaClient()` to the shared `@/lib/prisma`
// singleton — the local copy opened its own connection pool per serverless instance.
export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const { postId } = await params;

    const translations = await prisma.postTranslation.findMany({
      where: { postId },
      select: { locale: true, title: true, description: true, content: true, image: true }
    });

    return NextResponse.json(translations);
  } catch (error) {
    console.error('Error fetching post translations:', error);
    return NextResponse.json({ error: 'Failed to fetch translations' }, { status: 500 });
  }
}
