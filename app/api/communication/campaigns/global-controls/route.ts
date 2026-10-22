import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  readCampaignGlobalControls,
  setCampaignGlobalControls,
  MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS,
} from "@/lib/communication/campaign-send-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  emergencyStop: z.boolean().optional(),
  whatsappMarketingCooldownDays: z.number().int()
    .min(MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS)
    .max(MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS)
    .optional(),
}).refine((value) => value.emergencyStop !== undefined || value.whatsappMarketingCooldownDays !== undefined);

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  const result = await readCampaignGlobalControls();
  if (!result.ok) return NextResponse.json({ ok: false, error: "تعذّر تحميل إعدادات الإرسال العامة." }, { status: 503 });
  return NextResponse.json({ ok: true, ...result.controls });
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

  const envHardStop = String(process.env.COMMUNICATION_CAMPAIGN_EMERGENCY_STOP ?? "").toLowerCase() === "true";
  if (envHardStop && parsed.data.emergencyStop === false) {
    return NextResponse.json({
      ok: false,
      error: "إيقاف الطوارئ مفروض من إعدادات الخادم ولا يمكن إلغاؤه من الداشبورد.",
      code: "EMERGENCY_STOP_ENV_LOCK",
    }, { status: 409 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const saved = await setCampaignGlobalControls(parsed.data, actor.actorId ?? null);
  if (!saved) {
    return NextResponse.json({ ok: false, error: "تعذّر حفظ إعدادات الإرسال العامة." }, { status: 500 });
  }

  const emergencyStopChanged = parsed.data.emergencyStop !== undefined;
  const cooldownChanged = parsed.data.whatsappMarketingCooldownDays !== undefined;
  await writeAuditLog({
    actorId: actor.actorId ?? undefined,
    actorName: actor.actorName ?? undefined,
    actorRole: actor.actorRole ?? "ADMIN",
    action: emergencyStopChanged
      ? (parsed.data.emergencyStop
          ? "communication.campaign.emergency-stop.enabled"
          : "communication.campaign.emergency-stop.disabled")
      : "communication.campaign.whatsapp-marketing-cooldown.updated",
    messageAr: emergencyStopChanged
      ? (parsed.data.emergencyStop
          ? "تم تفعيل إيقاف الطوارئ العام لجميع حملات التواصل"
          : "تم إلغاء إيقاف الطوارئ العام لحملات التواصل")
      : `تم ضبط الفاصل بين الرسائل التسويقية عبر واتساب إلى ${saved.whatsappMarketingCooldownDays} يومًا`,
    messageEn: emergencyStopChanged
      ? (parsed.data.emergencyStop
          ? "Global communication campaign emergency stop enabled"
          : "Global communication campaign emergency stop disabled")
      : `WhatsApp marketing message interval set to ${saved.whatsappMarketingCooldownDays} days`,
    entityType: "CommunicationGlobalControl",
    entityId: "global",
    metadata: {
      emergencyStop: saved.emergencyStop,
      whatsappMarketingCooldownDays: saved.whatsappMarketingCooldownDays,
      changedEmergencyStop: emergencyStopChanged,
      changedMarketingCooldown: cooldownChanged,
      externalCall: false,
    },
    stream: "TEAM",
  });

  return NextResponse.json({ ok: true, ...saved });
}
