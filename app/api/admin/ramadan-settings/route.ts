import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { ramadanSettingsSchema } from "@/lib/minbar/ramadan-settings-validation";
import { readRamadanSettings, ramadanProjectOptions, saveRamadanSettings, RamadanSettingsConflict, RamadanProjectUnavailable } from "@/lib/minbar/ramadan-settings-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  try {
    const [document, projects] = await Promise.all([readRamadanSettings(), ramadanProjectOptions()]);
    return NextResponse.json({ ...document, projects }, { headers });
  } catch { return NextResponse.json({ error: "تعذر تحميل إعدادات جدولة رمضان" }, { status: 503, headers }); }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const body = z.object({ revision: z.string().uuid().nullable(), settings: ramadanSettingsSchema }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "بيانات غير صالحة" }, { status: 400, headers });
  try {
    const before = await readRamadanSettings().catch(() => null);
    const saved = await saveRamadanSettings(body.data.settings, body.data.revision);
    const s = saved.settings;
    await writeAuditLog({ ...auditActorFromDashboardSession(session!), stream: "TEAM", action: "ramadan.settings.update", entityType: "RecurringPageSettings", entityId: "ramadan",
      messageAr: s.enabled !== before?.settings.enabled ? (s.enabled ? "تفعيل صفحة جدولة رمضان" : "إيقاف صفحة جدولة رمضان") : before && s.startDate !== before.settings.startDate ? `تغيير تاريخ 1 رمضان إلى ${s.startDate}` : "تحديث إعدادات جدولة رمضان",
      messageEn: "Updated Ramadan scheduling settings",
      metadata: { enabled: s.enabled, hijriYear: s.hijriYear, startDate: s.startDate, previousStartDate: before?.settings.startDate ?? null, startConfirmed: s.startConfirmed, projects: s.projectIds.length } });
    return NextResponse.json(saved, { headers });
  } catch (error) {
    const conflict = error instanceof RamadanSettingsConflict, unavailable = error instanceof RamadanProjectUnavailable;
    return NextResponse.json({ error: conflict ? "تغيرت الإعدادات لدى مسؤول آخر. أعد تحميلها قبل الحفظ." : unavailable ? "بعض المشاريع لم تعد منشورة. راجع اختياراتك قبل الحفظ." : "تعذر حفظ إعدادات جدولة رمضان" }, { status: conflict || unavailable ? 409 : 503, headers });
  }
}
