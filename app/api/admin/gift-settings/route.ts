import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { giftSettingsSchema } from "@/lib/minbar/gift-settings-validation";
import { readGiftSettings, giftProjectOptions, saveGiftSettings, GiftSettingsConflict, GiftProjectUnavailable } from "@/lib/minbar/gift-settings-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  try {
    const [document, projects] = await Promise.all([readGiftSettings(), giftProjectOptions()]);
    return NextResponse.json({ ...document, projects: projects.map(p => ({ id: p.id.toLowerCase(), title: p.title })) }, { headers });
  } catch { return NextResponse.json({ error: "تعذر تحميل إعدادات صفحة الإهداء" }, { status: 503, headers }); }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const body = z.object({ revision: z.string().uuid().nullable(), settings: giftSettingsSchema }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "بيانات غير صالحة" }, { status: 400, headers });
  try {
    const before = await readGiftSettings().catch(() => null);
    const saved = await saveGiftSettings(body.data.settings, body.data.revision);
    const s = saved.settings;
    await writeAuditLog({ ...auditActorFromDashboardSession(session!), stream: "TEAM", action: "gift.settings.update", entityType: "RecurringPageSettings", entityId: "gift",
      messageAr: s.enabled !== before?.settings.enabled ? (s.enabled ? "تفعيل صفحة الإهداء" : "إيقاف صفحة الإهداء") : "تحديث إعدادات صفحة الإهداء",
      messageEn: "Updated gift page settings",
      metadata: { enabled: s.enabled, amounts: s.amounts, waqf: s.waqf, impactGifts: s.impactGifts.length, open: Boolean(s.openProjectId) } });
    return NextResponse.json(saved, { headers });
  } catch (error) {
    const conflict = error instanceof GiftSettingsConflict, unavailable = error instanceof GiftProjectUnavailable;
    return NextResponse.json({ error: conflict ? "تغيرت الإعدادات لدى مسؤول آخر. أعد تحميلها قبل الحفظ." : unavailable ? "بعض المشاريع لم تعد منشورة. راجع اختياراتك قبل الحفظ." : "تعذر حفظ إعدادات صفحة الإهداء" }, { status: conflict || unavailable ? 409 : 503, headers });
  }
}
