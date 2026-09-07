import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/campaigns/slug/check?locale=ar&slug=my-slug&campaignId=<id>
 *
 * Backs the «فحص» (check availability) button in the per-locale slug editor. The button has
 * always called this path, but the route did not exist — every check 404'd and the UI told
 * the admin that every slug was already taken.
 *
 * A slug is unavailable when another campaign already uses it, either as its base
 * `Campaign.slug` or as a `CampaignTranslation.slug` for the SAME locale. The campaign being
 * edited is excluded so re-checking its own current slug reports available.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "campaigns");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get("slug") ?? "").trim().toLowerCase();
  const locale = (searchParams.get("locale") ?? "").trim();
  const campaignId = (searchParams.get("campaignId") ?? "").trim() || null;

  if (!slug) {
    return NextResponse.json({ available: false, reason: "SLUG_REQUIRED" }, { status: 400 });
  }
  if (!locale) {
    return NextResponse.json({ available: false, reason: "LOCALE_REQUIRED" }, { status: 400 });
  }

  try {
    const [baseConflict, translationConflict] = await Promise.all([
      prisma.campaign.findFirst({
        where: { slug, ...(campaignId ? { NOT: { id: campaignId } } : {}) },
        select: { id: true },
      }),
      prisma.campaignTranslation.findFirst({
        where: { slug, locale, ...(campaignId ? { NOT: { campaignId } } : {}) },
        select: { id: true },
      }),
    ]);

    const conflict = baseConflict ?? translationConflict;
    return NextResponse.json({
      available: !conflict,
      slug,
      locale,
      reason: conflict ? (baseConflict ? "TAKEN_BY_CAMPAIGN_SLUG" : "TAKEN_IN_LOCALE") : null,
    });
  } catch (error) {
    console.error("slug check failed", error);
    return NextResponse.json({ available: false, reason: "CHECK_FAILED" }, { status: 500 });
  }
}
