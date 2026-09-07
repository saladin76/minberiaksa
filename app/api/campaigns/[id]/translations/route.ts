// app/api/campaigns/[id]/translations/route.ts
// Endpoint to fetch all translations for a campaign (for editing purposes)
// GET /api/campaigns/[id]/translations - Returns all translations (en, fr, etc.)

import { NextRequest, NextResponse } from "next/server";
// Was `new PrismaClient()` guarded by a global that is only ever populated
// outside production — so in production this module opened a second connection
// pool of its own instead of reusing the shared singleton.
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // This returns every locale's draft copy, so it belongs behind the same gate
    // as the campaign editor it feeds. The imports were already here but the
    // check was never performed.
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const { id: idOrSlug } = await params;

    // Resolve the param (id, base slug, or a per-locale translation slug) in ONE
    // query. This used to loop over 8 locales issuing a findFirst each until one
    // matched — up to 8 sequential round trips (~4s here) to answer a question
    // `whereByIdOrAnyLocaleSlug` settles in a single locale-agnostic clause.
    const camp = await prisma.campaign.findFirst({
      where: whereByIdOrAnyLocaleSlug(idOrSlug),
      select: { id: true },
    });
    if (!camp) return NextResponse.json([]);

    // ✅ Fetch all translations for the campaign (including per-locale slug for editing)
    const translations = await prisma.campaignTranslation.findMany({
      where: {
        campaignId: camp.id,
      },
      select: {
        locale: true,
        title: true,
        description: true,
        image: true,
        videoUrl: true,
        slug: true,
      },
    });

    return NextResponse.json(translations);
    
  } catch (error) {
    console.error("Error fetching campaign translations:", error);
    return NextResponse.json(
      { error: "Failed to fetch translations" },
      { status: 500 }
    );
  }
}