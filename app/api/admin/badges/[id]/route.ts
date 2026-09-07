import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

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
    const updateData: { name?: string; color?: string; criteria?: unknown; order?: number } = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;
    if (criteria !== undefined) updateData.criteria = criteria;
    if (order !== undefined) updateData.order = order;

    if (translations && typeof translations === "object") {
      for (const [locale, nameVal] of Object.entries(translations)) {
        await prisma.badgeTranslation.upsert({
          where: {
            badgeId_locale: { badgeId: id, locale },
          },
          create: { badgeId: id, locale, name: (nameVal as string) || "" },
          update: { name: (nameVal as string) || "" },
        });
      }
    }

    const badge = await prisma.badge.update({
      where: { id },
      data: updateData,
      include: { translations: true },
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
