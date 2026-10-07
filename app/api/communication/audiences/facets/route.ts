import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const [countryRows, campaigns, badges] = await Promise.all([
    prisma.user.groupBy({
      by: ["countryCode"],
      where: { role: "DONOR", countryCode: { not: null } },
      _count: { id: true },
    }).catch(() => []),
    prisma.campaign.findMany({
      where: { isActive: { not: false } },
      select: { id: true, title: true, slug: true },
      orderBy: { title: "asc" },
      take: 500,
    }).catch(() => []),
    prisma.badge.findMany({
      select: { id: true, name: true, color: true, translations: { select: { locale: true, name: true } } },
      orderBy: { order: "asc" },
      take: 200,
    }).catch(() => []),
  ]);

  const countries = countryRows
    .filter((row): row is typeof row & { countryCode: string } => Boolean(row.countryCode))
    .map((row) => ({
      code: row.countryCode,
      name: getCountryDisplayNameFromCode(row.countryCode, "ar"),
      count: row._count.id,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    countries,
    projects: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.title,
      slug: campaign.slug,
    })),
    badges: badges.map((badge) => ({
      id: badge.id,
      name: badge.translations.find((translation) => translation.locale === "ar")?.name || badge.name,
      color: badge.color,
    })),
  });
}
