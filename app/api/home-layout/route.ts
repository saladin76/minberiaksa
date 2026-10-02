import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { parseHomeLayout, validateHomeLayoutBody } from "@/lib/minbar/home-layout";

/**
 * GET /api/home-layout  the homepage arrangement, parsed with defaults filled in.
 * PUT /api/home-layout  replace it. A body of `{ reset: true }` clears the row
 *     back to null, which is the approved design's arrangement.
 *
 * Both under `siteContent`, the permission of the rest of the homepage's settings.
 */

async function getOrCreateSettings() {
  const existing = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.globalSettings.create({ data: {} });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const row = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { homeLayout: true, updatedAt: true },
    });
    return NextResponse.json({
      config: parseHomeLayout(row?.homeLayout ?? null),
      customised: row?.homeLayout != null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    console.error("GET /api/home-layout:", e);
    return NextResponse.json({ error: "Failed to read the homepage layout" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const reset = body.reset === true;
    let config = null;
    if (!reset) {
      try {
        config = validateHomeLayoutBody(body.config ?? body);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid homeLayout" }, { status: 400 });
      }
    }

    const existing = await getOrCreateSettings();
    const saved = await prisma.globalSettings.update({
      where: { id: existing.id },
      data: { homeLayout: config ? (config as unknown as Prisma.InputJsonValue) : null },
      select: { homeLayout: true, updatedAt: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "HOME_LAYOUT_UPDATE",
      messageAr: reset
        ? `${actor.actorName ?? "مسؤول"} أعاد ترتيب الصفحة الرئيسية إلى الوضع الافتراضي`
        : `${actor.actorName ?? "مسؤول"} عدّل ترتيب أقسام الصفحة الرئيسية`,
      entityType: "GlobalSettings",
      entityId: existing.id,
    });

    return NextResponse.json({
      config: parseHomeLayout(saved.homeLayout),
      customised: saved.homeLayout != null,
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    console.error("PUT /api/home-layout:", e);
    return NextResponse.json({ error: "Failed to save the homepage layout" }, { status: 500 });
  }
}
