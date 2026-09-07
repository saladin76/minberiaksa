import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMinCookieExpiryDaysForEdit,
  getReferralCookieSettingsWindow,
} from "@/lib/referral-cookie-settings";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

/** GET /api/referrals/[id] - Get one referral (admin only) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "referrals");
    if (denied) return denied;
    const { id } = await params;
    const referral = await prisma.referral.findUnique({
      where: { id },
      include: { _count: { select: { donations: true } } },
    });
    if (!referral) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }
    const cookieExpiryDays = referral.cookieExpiryDays ?? 30;
    const { daysLeft, canEditCookieExpiry } = getReferralCookieSettingsWindow(
      referral.createdAt,
      cookieExpiryDays
    );
    return NextResponse.json({
      id: referral.id,
      code: referral.code,
      name: referral.name,
      cookieExpiryDays,
      createdAt: referral.createdAt,
      donationsCount: referral._count.donations,
      cookieSettingsDaysLeft: daysLeft,
      canEditCookieExpiry,
    });
  } catch (error) {
    console.error("Error fetching referral:", error);
    return NextResponse.json(
      { error: "Failed to fetch referral" },
      { status: 500 }
    );
  }
}

/** PATCH /api/referrals/[id] - Update cookie duration (admin) while edit window is open */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "referrals");
    if (denied) return denied;
    const { id } = await params;
    const body = await request.json();
    const rawExpiry = body?.cookieExpiryDays;

    const referral = await prisma.referral.findUnique({
      where: { id },
      select: { id: true, cookieExpiryDays: true, createdAt: true },
    });
    if (!referral) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    const currentDays = referral.cookieExpiryDays ?? 30;
    const { canEditCookieExpiry } = getReferralCookieSettingsWindow(
      referral.createdAt,
      currentDays
    );
    if (!canEditCookieExpiry) {
      return NextResponse.json(
        {
          error:
            "انتهت مهلة تعديل مدة الكوكي لهذا الرابط. لا يمكن التعديل بعد انتهاء النافذة.",
        },
        { status: 403 }
      );
    }

    if (typeof rawExpiry !== "number" || rawExpiry < 0) {
      return NextResponse.json(
        { error: "cookieExpiryDays must be a number >= 0 (0 = unlimited)" },
        { status: 400 }
      );
    }
    let cookieExpiryDays = Math.min(Math.floor(rawExpiry), 3650);

    if (cookieExpiryDays > 0) {
      const minDays = getMinCookieExpiryDaysForEdit(referral.createdAt);
      if (cookieExpiryDays < minDays) {
        return NextResponse.json(
          {
            error: `الحد الأدنى لمدة الكوكي هو ${minDays} يومًا (عدد الأيام المنقضية منذ الإنشاء + 1).`,
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.referral.update({
      where: { id },
      data: { cookieExpiryDays },
      include: { _count: { select: { donations: true } } },
    });

    const nextExpiry = updated.cookieExpiryDays ?? 30;
    const { daysLeft, canEditCookieExpiry: stillEditable } =
      getReferralCookieSettingsWindow(updated.createdAt, nextExpiry);

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: "REFERRAL_COOKIE_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل مدة كوكي رابط التتبع «${updated.code}» من ${currentDays} إلى ${nextExpiry} يومًا${nextExpiry === 0 ? " (غير محدود)" : ""}`,
      messageEn: `Cookie duration for referral ${updated.code}: ${currentDays} → ${nextExpiry} days`,
      entityType: "Referral",
      entityId: id,
      metadata: { previousDays: currentDays, newDays: nextExpiry },
    });

    return NextResponse.json({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      cookieExpiryDays: nextExpiry,
      createdAt: updated.createdAt,
      donationsCount: updated._count.donations,
      cookieSettingsDaysLeft: daysLeft,
      canEditCookieExpiry: stillEditable,
    });
  } catch (error) {
    console.error("Error updating referral:", error);
    return NextResponse.json(
      { error: "Failed to update referral" },
      { status: 500 }
    );
  }
}
