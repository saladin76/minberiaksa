import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { parseIncludeInactive } from "@/lib/campaign/include-inactive-query";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const includeInactive = parseIncludeInactive(request.nextUrl.searchParams);
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const campaigns = await prisma.campaign.findMany({
      where: {
        AND: [
          includeInactive ? {} : { isActive: true },
          NOT_SOFT_DELETED,
        ].filter((condition) => Object.keys(condition).length > 0),
      },
      include: {
        translations: {
          where: translationLocaleWhere(locale),
          select: {
            locale: true,
            title: true,
            description: true,
            image: true,
            videoUrl: true,
            slug: true,
          },
          take: 2,
        },
        categories: {
          include: {
            translations: {
              where: translationLocaleWhere(locale),
              select: { locale: true, name: true, slug: true },
              take: 2,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const out = campaigns.map((campaign) => {
      const tCampaign = pickTranslation(campaign.translations, locale);
      const categories = campaign.categories.map((category) => {
        const tCategory = pickTranslation(category.translations, locale);
        return {
          ...category,
          slug: tCategory?.slug || category.slug,
          name: tCategory?.name || category.name,
          translations: undefined,
        };
      });

      return {
        ...campaign,
        slug: tCampaign?.slug || campaign.slug || campaign.id,
        title: tCampaign?.title || campaign.title,
        description: tCampaign?.description || campaign.description,
        images:
          tCampaign?.image && Array.isArray(campaign.images)
            ? [tCampaign.image, ...campaign.images.slice(1)]
            : campaign.images,
        videoUrl: tCampaign?.videoUrl || campaign.videoUrl,
        categories,
        category: categories[0] ?? null,
      };
    });

    return NextResponse.json(out, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
