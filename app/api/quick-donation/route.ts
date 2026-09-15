import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { parseQuickDonation, validateQuickDonationBody } from "@/lib/minbar/quick-donation";

/**
 * GET /api/quick-donation — the homepage quick-donation config, parsed with
 *     defaults filled in. Public: nothing in it is a secret and the homepage
 *     renders it into every visitor's HTML anyway.
 * PUT /api/quick-donation — replace the whole config. `siteContent`, the same
 *     permission as the rest of the homepage's editable content.
 */

async function getOrCreateSettings() {
  const existing = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.globalSettings.create({ data: {} });
}

export async function GET() {
  try {
    const row = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { quickDonation: true, updatedAt: true },
    });
    return NextResponse.json({ config: parseQuickDonation(row?.quickDonation ?? null), updatedAt: row?.updatedAt ?? null });
  } catch (e) {
    console.error("GET /api/quick-donation:", e);
    return NextResponse.json({ error: "Failed to read the quick-donation settings" }, { status: 500 });
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

    let config;
    try {
      config = validateQuickDonationBody(body.config ?? body);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid quickDonation" }, { status: 400 });
    }

    const existing = await getOrCreateSettings();
    const saved = await prisma.globalSettings.update({
      where: { id: existing.id },
      data: { quickDonation: config as unknown as Prisma.InputJsonValue },
      select: { quickDonation: true, updatedAt: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "QUICK_DONATION_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل إعدادات التبرع السريع في الصفحة الرئيسية`,
      entityType: "GlobalSettings",
      entityId: existing.id,
    });

    return NextResponse.json({ config: parseQuickDonation(saved.quickDonation), updatedAt: saved.updatedAt });
  } catch (e) {
    console.error("PUT /api/quick-donation:", e);
    return NextResponse.json({ error: "Failed to save the quick-donation settings" }, { status: 500 });
  }
}
