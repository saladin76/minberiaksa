import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { isValidLocale } from "@/lib/locales";
import type { Prisma } from "@prisma/client";
import { normalizeBadgeCriteria } from "@/lib/badge-criteria-core";

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const badges = await prisma.badge.findMany({
      orderBy: { order: "asc" },
      include: {
        translations: { select: { locale: true, name: true } },
      },
    });
    const items = badges.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      criteria: b.criteria,
      order: b.order,
      createdAt: b.createdAt,
      translationCount: b.translations.filter((translation) => translation.name.trim().length > 0).length,
      translatedName: b.name,
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const color = body.color ?? "#3b82f6";
    const criteria = normalizeBadgeCriteria(body.criteria);
    const order = body.order ?? 0;
    const translations = normalizeTranslations(body.translations);
    if (!name || name.length > 80 || !criteria || !/^#[0-9a-f]{6}$/i.test(color) || !Number.isInteger(order) || order < 0 || !translations) {
      return NextResponse.json(
        { error: "Enter a name, valid color, valid criteria, and supported translations" },
        { status: 400 }
      );
    }
    const badge = await prisma.badge.create({
      data: {
        name,
        color,
        criteria: criteria as unknown as Prisma.InputJsonValue,
        order,
        translations:
          Object.keys(translations).length > 0
            ? {
                create: Object.entries(translations).map(([locale, translatedName]) => ({ locale, name: translatedName })),
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

function normalizeTranslations(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const [locale, name] of Object.entries(value)) {
    if (!isValidLocale(locale) || typeof name !== "string" || name.trim().length > 80) return null;
    if (name.trim()) result[locale] = name.trim();
  }
  return result;
}
