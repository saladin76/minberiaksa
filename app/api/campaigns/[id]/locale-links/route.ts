import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { LOCALES, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { getServerBaseUrl } from "@/lib/server-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The public link of a campaign in every enabled language, for the campaign
 * editor: the "روابط اللغات" section (copy / open) and the per-language slug
 * editor both read it.
 *
 * A language's own slug (`CampaignTranslation.slug`) wins; otherwise the page
 * answers at the base `Campaign.slug`, which is also the Arabic one  the slug
 * editor saves Arabic to the base slug for that reason. Falls back to the id
 * when the campaign has no slug at all, since `/projects/<id>` resolves too.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "campaigns");
  if (denied) return denied;

  const { id: idOrSlug } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: whereByIdOrAnyLocaleSlug(idOrSlug),
    select: { id: true, slug: true, translations: { select: { locale: true, slug: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "NOT_FOUND", links: [] }, { status: 404 });

  const own = new Map(campaign.translations.filter((t) => t.slug?.trim()).map((t) => [t.locale, t.slug!.trim()]));
  const base = campaign.slug?.trim() || campaign.id;
  const origin = await getServerBaseUrl();

  const links = SUPPORTED_LOCALES.map((locale) => {
    const custom = locale === DEFAULT_LOCALE ? null : own.get(locale) ?? null;
    const slug = custom ?? base;
    const path = miaPath("projectDetail", locale, encodeURIComponent(slug));
    return {
      locale,
      label: LOCALES[locale].label,
      slug: locale === DEFAULT_LOCALE ? campaign.slug ?? "" : custom ?? "",
      path,
      url: `${origin}${path}`,
      hasCustomSlug: locale === DEFAULT_LOCALE ? Boolean(campaign.slug) : Boolean(custom),
    };
  });

  return NextResponse.json({ links });
}
