import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { campaignEmergencyStopEnabled, setCampaignEmergencyStop } from "@/lib/communication/campaign-send-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ emergencyStop: z.boolean() });

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    emergencyStop: await campaignEmergencyStopEnabled(),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const saved = await setCampaignEmergencyStop(parsed.data.emergencyStop, actor.actorId ?? null);
  if (!saved) {
    return NextResponse.json({ ok: false, error: "تعذّر حفظ إيقاف الطوارئ." }, { status: 500 });
  }

  await writeAuditLog({
    actorId: actor.actorId ?? undefined,
    actorName: actor.actorName ?? undefined,
    actorRole: actor.actorRole ?? "ADMIN",
    action: parsed.data.emergencyStop
      ? "communication.campaign.emergency-stop.enabled"
      : "communication.campaign.emergency-stop.disabled",
    messageAr: parsed.data.emergencyStop
      ? "تم تفعيل إيقاف الطوارئ العام لجميع حملات التواصل"
      : "تم إلغاء إيقاف الطوارئ العام لحملات التواصل",
    messageEn: parsed.data.emergencyStop
      ? "Global communication campaign emergency stop enabled"
      : "Global communication campaign emergency stop disabled",
    entityType: "CommunicationGlobalControl",
    entityId: "global",
    metadata: { emergencyStop: parsed.data.emergencyStop, externalCall: false },
    stream: "TEAM",
  });

  return NextResponse.json({ ok: true, emergencyStop: parsed.data.emergencyStop });
}
