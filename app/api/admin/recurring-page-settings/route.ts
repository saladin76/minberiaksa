import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { recurringPageSettingsSchema } from "@/lib/minbar/recurring-page-settings-validation";
import { readRecurringPageSettings, recurringPageProjectOptions, saveRecurringPageSettings, RecurringPageSettingsConflict, RecurringPageProjectUnavailable } from "@/lib/minbar/recurring-page-settings-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  try {
    const [document, projects] = await Promise.all([readRecurringPageSettings(), recurringPageProjectOptions()]);
    return NextResponse.json({ ...document, projects }, { headers });
  } catch { return NextResponse.json({ error: "تعذر تحميل إعدادات صفحة التبرع الدوري" }, { status: 503, headers }); }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const body = z.object({ revision: z.string().uuid().nullable(), settings: recurringPageSettingsSchema }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "بيانات غير صالحة" }, { status: 400, headers });
  try {
    const saved = await saveRecurringPageSettings(body.data.settings, body.data.revision);
    await writeAuditLog({ ...auditActorFromDashboardSession(session!), stream: "TEAM", action: "recurring.page.settings.update", entityType: "RecurringPageSettings", entityId: "public", messageAr: "تحديث مبالغ ومشاريع صفحة التبرع الدوري", messageEn: "Updated recurring donation page amounts and projects", metadata: { projectMode: saved.settings.projectMode, projects: saved.settings.projectIds.length } });
    return NextResponse.json(saved, { headers });
  } catch (error) {
    const conflict = error instanceof RecurringPageSettingsConflict, unavailable = error instanceof RecurringPageProjectUnavailable;
    return NextResponse.json({ error: conflict ? "تغيرت الإعدادات لدى مسؤول آخر. أعد تحميلها قبل الحفظ." : unavailable ? "بعض المشاريع لم تعد منشورة. راجع اختياراتك قبل الحفظ." : "تعذر حفظ إعدادات صفحة التبرع الدوري" }, { status: conflict || unavailable ? 409 : 503, headers });
  }
}
