import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { listRestrictedDonationActors, releaseDonationAbuseActor } from "@/lib/site-security/donation-abuse-store";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  try {
    const records = await listRestrictedDonationActors();
    return reply({
      rows: records.map((r) => ({
        id: r.id, revision: r.revision, phase: r.state.phase,
        failedAttempts: r.state.failedAttempts, until: r.state.until,
        lastEventAt: r.lastEventAt,
      })),
      truncated: records.length === 100,
    });
  } catch {
    return reply({ error: "FRAUD_CASES_UNAVAILABLE" }, 503);
  }
}
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  try {
    if (!request.headers.get("origin") ||
        new URL(request.headers.get("origin")!).origin !== new URL(configured || request.url).origin)
      return reply({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  } catch {
    return reply({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  }
  const raw = await request.json().catch(() => null);
  if (!raw || raw.confirmation !== "RELEASE_FRAUD_BLOCK" ||
      typeof raw.id !== "string" || !/^[a-f0-9]{64}$/.test(raw.id) ||
      !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 1 ||
      typeof raw.reason !== "string" || raw.reason.trim().length < 10 || raw.reason.length > 300)
    return reply({ error: "INVALID_FRAUD_RELEASE" }, 400);
  try {
    const updated = await releaseDonationAbuseActor({
      actorId: raw.id,
      expectedRevision: raw.expectedRevision,
      operatorId: session!.user.id,
      reason: raw.reason.trim(),
    });
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: "DONATION_FRAUD_BLOCK_RELEASE",
      entityType: "DonationAbuseActorState",
      entityId: updated.id,
      messageAr: "رفع حظر المحاولات المشبوهة بعد مراجعة المسؤول",
      metadata: { reason: raw.reason.trim(), revision: updated.revision },
    });
    return reply({ ok: true, revision: updated.revision });
  } catch (e) {
    return reply({
      error: e instanceof Error && e.message === "FRAUD_STATE_STALE"
        ? "FRAUD_STATE_STALE" : "FRAUD_RELEASE_FAILED",
    }, e instanceof Error && e.message === "FRAUD_STATE_STALE" ? 409 : 503);
  }
}
