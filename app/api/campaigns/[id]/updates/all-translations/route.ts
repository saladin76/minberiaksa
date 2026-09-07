// app/api/campaigns/[id]/updates/all-translations/route.ts
// Endpoint to fetch all updates with ALL their translations (for editing purposes)
// GET /api/campaigns/[id]/updates/all-translations

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

// Admin-only ("for editing purposes", per the header comment): returns every locale for every
// update on a campaign. Unauthenticated it exposed all translation drafts by campaign id.
// Uses the shared prisma singleton instead of a per-module PrismaClient.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const { id } = await params;

    // ✅ Fetch all updates with ALL translations
    const updates = await prisma.update.findMany({
      where: {
        campaignId: id,
      },
      select: {
        id: true,
        title: true,        // Arabic default
        description: true,  // Arabic default
        image: true,
        videoUrl: true,
        createdAt: true,
        
        // Fetch ALL translations (not filtered by locale)
        translations: {
          select: {
            locale: true,
            title: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Was `Cache-Control: public, s-maxage=60` — on an authenticated admin response that lets
    // a shared CDN store per-admin content and potentially serve it to another requester.
    // Must be private/no-store now that the route is session-guarded.
    return NextResponse.json(updates, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
    
  } catch (error) {
    console.error("Error fetching updates with translations:", error);
    return NextResponse.json(
      { error: "Failed to fetch updates" },
      { status: 500 }
    );
  }
}