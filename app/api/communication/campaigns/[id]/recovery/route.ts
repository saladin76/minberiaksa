import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { inspectCampaignRecovery, queueCampaignRecovery } from "@/lib/communication/campaign-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages"); if (denied) return denied;
  try {
    const result = await inspectCampaignRecovery((await params).id);
    return NextResponse.json(result, { status: result.ok ? 200 : result.status });
  } catch { return NextResponse.json({ ok: false, error: "DIAGNOSTIC_UNAVAILABLE" }, { status: 503 }); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages"); if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (body?.confirm !== true) return NextResponse.json({ ok: false, error: "CONFIRM_REQUIRED" }, { status: 400 });
  try {
    const result = await queueCampaignRecovery((await params).id, auditActorFromDashboardSession(session!));
    return NextResponse.json(result, { status: result.ok ? 200 : result.status });
  } catch { return NextResponse.json({ ok: false, error: "RECOVERY_UNAVAILABLE" }, { status: 503 }); }
}
