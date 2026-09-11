import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { isJsonValue, isSettingKey, settingGroup } from "@/lib/content/site-setting-write";

/**
 * PUT    /api/site-settings/[key] — upsert one setting. Body: { value, group? }.
 * DELETE /api/site-settings/[key] — remove it.
 *
 * Both dashboard-only. There is no POST: a setting is addressed by its key, and
 * whether that key existed a moment ago is not something the caller should
 * have to know.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    if (!isSettingKey(key)) {
      return NextResponse.json(
        { error: "المفتاح يجب أن يكون بأحرف لاتينية صغيرة، مثل contact.phone" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !("value" in body)) {
      return NextResponse.json({ error: "القيمة مطلوبة" }, { status: 400 });
    }
    if (!isJsonValue(body.value)) {
      return NextResponse.json({ error: "القيمة ليست JSON صالحًا" }, { status: 400 });
    }
    const value = body.value as Prisma.InputJsonValue;
    const group = settingGroup(body.group);

    const row = await prisma.siteSetting.upsert({
      where: { key },
      /* Group is only written when given: a value-only update from the
         inline editor must not blank the section the key was filed under. */
      update: { value, ...(body.group !== undefined ? { group: group ?? null } : {}) },
      create: { key, value, group },
      select: { key: true, value: true, group: true, updatedAt: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SITE_SETTING_SET",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث إعداد الموقع: ${key}`,
      entityType: "SiteSetting",
      entityId: key,
    });

    return NextResponse.json({
      key: row.key,
      value: row.value,
      group: row.group ?? "",
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error saving site setting:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ الإعداد") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const existing = await prisma.siteSetting.findUnique({ where: { key }, select: { key: true } });
    if (!existing) return NextResponse.json({ error: "Setting not found" }, { status: 404 });

    await prisma.siteSetting.delete({ where: { key } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SITE_SETTING_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف إعداد الموقع: ${key}`,
      entityType: "SiteSetting",
      entityId: key,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting site setting:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف الإعداد") },
      { status: 500 }
    );
  }
}
