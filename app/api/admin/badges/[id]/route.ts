import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { isValidLocale } from "@/lib/locales";
import { normalizeBadgeCriteria } from "@/lib/badge-criteria-core";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const { id } = await params;
    const badge = await prisma.badge.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!badge) return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    return NextResponse.json(badge);
  } catch (error) {
    console.error("Error fetching badge:", error);
    return NextResponse.json({ error: "Failed to fetch badge" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const { id } = await params;
    const body = await request.json();
    const { name, color, criteria, order, translations } = body;
    const updateData: { name?: string; color?: string; criteria?: Prisma.InputJsonValue; order?: number } = {};
    let normalizedTranslations: Record<string, string> | undefined;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 80) return NextResponse.json({ error: "Name must contain 1 to 80 characters" }, { status: 400 });
      updateData.name = name.trim();
    }
    if (color !== undefined) {
      if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return NextResponse.json({ error: "Color must be a six-digit hex value" }, { status: 400 });
      updateData.color = color;
    }
    if (criteria !== undefined) {
      const normalized = normalizeBadgeCriteria(criteria);
      if (!normalized) return NextResponse.json({ error: "Badge criteria are invalid" }, { status: 400 });
      updateData.criteria = normalized as unknown as Prisma.InputJsonValue;
    }
    if (order !== undefined) {
      if (!Number.isInteger(order) || order < 0) return NextResponse.json({ error: "Order must be a non-negative whole number" }, { status: 400 });
      updateData.order = order;
    }

    if (translations !== undefined) {
      if (!translations || typeof translations !== "object" || Array.isArray(translations)) return NextResponse.json({ error: "Translations must be an object" }, { status: 400 });
      normalizedTranslations = {};
      for (const [locale, nameVal] of Object.entries(translations)) {
        if (!isValidLocale(locale) || typeof nameVal !== "string" || nameVal.trim().length > 80) {
          return NextResponse.json({ error: "A translation uses an unsupported language or exceeds 80 characters" }, { status: 400 });
        }
        normalizedTranslations[locale] = nameVal.trim();
      }
    }

    if (!Object.keys(updateData).length && normalizedTranslations === undefined) {
      return NextResponse.json({ error: "No badge changes were provided" }, { status: 400 });
    }

    const badge = await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length) {
        await tx.badge.update({ where: { id }, data: updateData });
      }
      if (normalizedTranslations) {
        for (const [locale, translatedName] of Object.entries(normalizedTranslations)) {
          if (!translatedName) {
            await tx.badgeTranslation.deleteMany({ where: { badgeId: id, locale } });
            continue;
          }
          await tx.badgeTranslation.upsert({
            where: { badgeId_locale: { badgeId: id, locale } },
            create: { badgeId: id, locale, name: translatedName },
            update: { name: translatedName },
          });
        }
      }
      return tx.badge.findUniqueOrThrow({ where: { id }, include: { translations: true } });
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "BADGE_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل الشارة: ${badge.name}`,
      entityType: "Badge",
      entityId: id,
    });

    return NextResponse.json(badge);
  } catch (error) {
    console.error("Error updating badge:", error);
    return NextResponse.json({ error: "Failed to update badge" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "badges");
    if (denied) return denied;
    const { id } = await params;
    const existing = await prisma.badge.findUnique({
      where: { id },
      select: { name: true },
    });
    await prisma.badge.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "BADGE_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف الشارة: ${existing?.name ?? id}`,
      entityType: "Badge",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting badge:", error);
    return NextResponse.json({ error: "Failed to delete badge" }, { status: 500 });
  }
}
