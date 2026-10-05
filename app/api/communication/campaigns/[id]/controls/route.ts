import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getCampaign } from "@/lib/communication/campaign-service";
import { campaignSendControls } from "@/lib/communication/campaign-send-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  paused: z.boolean().optional(),
  speedMode: z.enum(["SAFE", "BALANCED", "FAST", "MAX"]).optional(),
  dailyCap: z.number().int().min(1).max(1_000_000).optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(1).max(120),
  }).optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, controls: campaignSendControls(campaign) });
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

  const currentMeta = (campaign.metadata as Record<string, unknown> | null) ?? {};
  const current = campaignSendControls(campaign);
  const next = {
    paused: parsed.data.paused ?? current.paused,
    speedMode: parsed.data.speedMode ?? current.speedMode,
    dailyCap: parsed.data.dailyCap ?? current.dailyCap,
    quietHours: parsed.data.quietHours ?? current.quietHours,
  };

  const updated = await prisma.communicationCampaign.update({
    where: { id },
    data: { metadata: { ...currentMeta, sendControls: next } as never },
  });

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
