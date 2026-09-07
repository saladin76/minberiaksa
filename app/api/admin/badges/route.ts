import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const locale = request.nextUrl.searchParams.get("locale") || "ar";
    const badges = await prisma.badge.findMany({
      orderBy: { order: "asc" },
      include: {
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true },
        },
      },
    });
    const items = badges.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      criteria: b.criteria,
      order: b.order,
      createdAt: b.createdAt,
      translatedName: pickTranslation(b.translations, locale)?.name ?? b.name,
    }));
    return NextResponse.json({ badges: items });
  } catch (error) {
    console.error("Error fetching badges:", error);
    return NextResponse.json({ error: "Failed to fetch badges" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const body = await request.json();
    const { name, color, criteria, order, translations } = body;
    if (!name || !criteria?.type) {
      return NextResponse.json(
        { error: "Name and criteria.type are required" },
        { status: 400 }
      );
    }
    const badge = await prisma.badge.create({
      data: {
        name: name,
        color: color || "#3b82f6",
        criteria: criteria,
        order: order ?? 0,
        translations:
          translations && Object.keys(translations).length > 0
            ? {
                create: Object.entries(translations).map(([locale, n]) => ({
                  locale,
                  name: (n as string) || name,
                })),
              }
            : undefined,
      },
      include: { translations: true },
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "BADGE_CREATE",
      messageAr: `${actor.name ?? "مسؤول"} أنشأ شارة جديدة: ${name}`,
      entityType: "Badge",
      entityId: badge.id,
    });

    return NextResponse.json(badge);
  } catch (error) {
    console.error("Error creating badge:", error);
    return NextResponse.json({ error: "Failed to create badge" }, { status: 500 });
  }
}
