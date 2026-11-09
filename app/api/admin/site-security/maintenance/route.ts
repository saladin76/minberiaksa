import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { readEmergencyMaintenance, setEmergencyMaintenance } from "@/lib/site-security/emergency-maintenance";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  try { return response(await readEmergencyMaintenance(true)); }
  catch { return response({ error: "MAINTENANCE_STATUS_UNAVAILABLE" }, 503); }
}
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredOrigin || request.url).origin;
    if (!origin || new URL(origin).origin !== expectedOrigin)
      return response({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  } catch {
    return response({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  }
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw.enabled !== "boolean" ||
      !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 0 ||
      typeof raw.reason !== "string" || raw.reason.trim().length < 10 ||
      raw.reason.length > 300 || typeof raw.confirmation !== "string" ||
      raw.confirmation !== (raw.enabled ? "ENABLE_MAINTENANCE" : "DISABLE_MAINTENANCE"))
    return response({ error: "INVALID_MAINTENANCE_COMMAND" }, 400);
  try {
    const updated = await setEmergencyMaintenance({
      enabled: raw.enabled,
      expectedRevision: raw.expectedRevision,
      reason: raw.reason.trim(),
      actorId: session!.user.id,
    });
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: raw.enabled ? "EMERGENCY_MAINTENANCE_ENABLE" : "EMERGENCY_MAINTENANCE_DISABLE",
      entityType: "SiteEmergencyMaintenance",
      entityId: "site",
      messageAr: raw.enabled ? "تفعيل وضع الصيانة الطارئ" : "تعطيل وضع الصيانة الطارئ",
      metadata: { revision: updated.revision, reason: updated.reason },
    });
    return response(updated);
  } catch (error) {
    return response(
      { error: error instanceof Error && error.message === "MAINTENANCE_STALE_REVISION"
        ? "MAINTENANCE_STALE_REVISION" : "MAINTENANCE_WRITE_FAILED" },
      error instanceof Error && error.message === "MAINTENANCE_STALE_REVISION" ? 409 : 503,
    );
  }
}
