import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { readEmergency, writeEmergency } from "@/lib/site-security/emergency";
import { isEmergencyMode } from "@/lib/site-security/emergency-policy";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
/** Sent by the dashboard after the operator typed the confirmation word. */
const CONFIRM_TOKEN = "CONFIRM_EMERGENCY";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  return reply(await readEmergency());
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { mode?: unknown; confirm?: unknown } | null;
  if (!isEmergencyMode(body?.mode)) return reply({ error: "INVALID_REQUEST" }, 400);
  if (body.mode !== "OFF" && body.confirm !== CONFIRM_TOKEN) return reply({ error: "CONFIRMATION_REQUIRED" }, 400);
  const by = session?.user?.email || session?.user?.name || "admin";
  try {
    const state = await writeEmergency(body.mode, by);
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: `SITE_EMERGENCY_${body.mode}`,
      entityType: "SiteEmergencyMode",
      entityId: "site",
      messageAr: body.mode === "SITE" ? "إغلاق الموقع العام بالكامل (وضع الطوارئ)" : body.mode === "DONATIONS" ? "إيقاف التبرعات مؤقتاً (الموقع يعمل)" : "إعادة تشغيل الموقع والتبرعات",
      metadata: { mode: body.mode },
    });
    return reply(state);
  } catch {
    return reply({ error: "EMERGENCY_WRITE_FAILED" }, 503);
  }
}
