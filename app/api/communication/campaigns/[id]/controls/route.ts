import { NextRequest, NextResponse } from "next/server";
import type { CommunicationCampaign } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { getCampaign } from "@/lib/communication/campaign-service";
import { campaignEmergencyStopEnabled, campaignSendControls, isValidTimeZone, whatsappSentLast24Hours } from "@/lib/communication/campaign-send-controls";
import { mutateCampaignMetadata } from "@/lib/communication/campaign-metadata-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  paused: z.boolean().optional(),
  speedMode: z.enum(["SAFE", "BALANCED", "FAST", "MAX"]).optional(),
  autoSpeed: z.boolean().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dailyCap: z.number().int().min(1).max(1_000_000).optional(),
  scheduledStopAt: z.string().datetime().nullable().optional(),
  resumeAt: z.string().datetime().nullable().optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(1).max(120).refine(isValidTimeZone, "Invalid IANA timezone"),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.scheduledStopAt && value.resumeAt) {
    const stop = Date.parse(value.scheduledStopAt);
    const resume = Date.parse(value.resumeAt);
    if (Number.isFinite(stop) && Number.isFinite(resume) && resume <= stop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resumeAt"],
        message: "وقت الاستئناف يجب أن يكون بعد وقت التوقف.",
      });
    }
  }
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const controls = campaignSendControls(campaign);
  const usedLast24h = campaign.channel === "WHATSAPP" ? await whatsappSentLast24Hours() : 0;
  return NextResponse.json({
    ok: true,
    controls,
    usage: {
      usedLast24h,
      remaining: campaign.channel === "WHATSAPP" ? Math.max(controls.dailyCap - usedLast24h, 0) : null,
    },
    global: { emergencyStop: campaignEmergencyStopEnabled() },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (["SENT", "SENT_WITH_ISSUES", "FAILED", "CANCELLED", "ARCHIVED"].includes(campaign.status)) {
    return NextResponse.json({ ok: false, error: "لا يمكن تعديل تحكمات حملة منتهية." }, { status: 409 });
  }

  const current = campaignSendControls(campaign);
  const requested = {
    paused: parsed.data.paused ?? current.paused,
    speedMode: parsed.data.speedMode ?? current.speedMode,
    autoSpeed: parsed.data.autoSpeed ?? current.autoSpeed,
    priority: parsed.data.priority ?? current.priority,
    dailyCap: parsed.data.dailyCap ?? current.dailyCap,
    scheduledStopAt: parsed.data.scheduledStopAt !== undefined ? parsed.data.scheduledStopAt : current.scheduledStopAt,
    resumeAt: parsed.data.resumeAt !== undefined ? parsed.data.resumeAt : current.resumeAt,
    quietHours: parsed.data.quietHours ?? current.quietHours,
  };

  // Normalize through the same rules the sender uses (notably the global WhatsApp cap),
  // then merge into the freshest metadata document so an in-flight send-progress write
  // cannot erase an operator's Pause/Resume or quiet-hours change.
  const normalized = campaignSendControls({
    metadata: { sendControls: requested } as never,
  } as Pick<CommunicationCampaign, "metadata">);
  const next = normalized;

  const saved = await mutateCampaignMetadata(id, (latest) => ({ ...latest, sendControls: next }));
  if (!saved) {
    return NextResponse.json({ ok: false, error: "تعذّر حفظ التحكمات بسبب تعديل متزامن. أعد المحاولة." }, { status: 409 });
  }
  const updated = await getCampaign(id);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    actorId: actor.actorId ?? undefined,
    actorName: actor.actorName ?? undefined,
    actorRole: actor.actorRole ?? "ADMIN",
    action: next.paused ? "communication.campaign.pause" : "communication.campaign.controls",
    messageAr: next.paused
      ? `تم إيقاف حملة «${campaign.name}» مؤقتًا`
      : `تم تحديث تحكمات إرسال حملة «${campaign.name}»`,
    messageEn: next.paused
      ? `Campaign paused: ${campaign.name}`
      : `Campaign send controls updated: ${campaign.name}`,
    entityType: "CommunicationCampaign",
    entityId: id,
    metadata: { sendControls: next, externalCall: false },
    stream: "TEAM",
  });

  return NextResponse.json({ ok: true, campaign: updated, controls: next });
}
