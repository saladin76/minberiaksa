import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

/**
 * Minimal lookup for the home revenue dashboard.
 * Unlike /api/campaigns/all, this does not require the separate campaigns
 * management permission or expose project editor/financial configuration.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "revenue");
  if (denied) return denied;

  const locale = request.nextUrl.searchParams.get("locale") || "ar";
  try {
    const campaigns = await prisma.campaign.findMany({
      where: NOT_SOFT_DELETED,
      select: {
        id: true,
        title: true,
        categoryIds: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      items: campaigns.map((campaign) => ({
        id: campaign.id,
        title: pickTranslation(campaign.translations, locale)?.title || campaign.title,
        categoryIds: campaign.categoryIds || [],
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[dashboard-filter-options] Unable to load campaign filter options");
    return NextResponse.json({ error: "Failed to load filters" }, { status: 500 });
  }
}
