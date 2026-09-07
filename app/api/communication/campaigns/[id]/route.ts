import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getCampaign, updateCampaign, deleteDraftCampaign } from "@/lib/communication/campaign-service";
import { getRecipientBreakdown } from "@/lib/communication/campaign-recipient-service";
import { listChannelTemplates } from "@/lib/communication/template-compat";
import type { CommunicationChannelId } from "@/lib/communication/communication-runtime-types";
import { COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  purpose: z.enum(COMMUNICATION_PURPOSES).optional(),
  templateGroupId: z.string().min(1).nullable().optional(),
  audienceSegmentKey: z.string().min(1).nullable().optional(),
});

/**
 * One campaign, plus what the detail view needs to describe it without a second round trip: the
 * template's display name and the live recipient breakdown for its audience.
 *
 * The breakdown is computed on read rather than stored. Eligibility moves underneath a campaign —
 * a donor opts out, a phone number is added — so a count frozen at creation time would quietly
 * describe an audience that no longer exists.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const channel = campaign.channel as CommunicationChannelId;
  const [templates, breakdown] = await Promise.all([
    listChannelTemplates(channel),
    getRecipientBreakdown(channel, { locale: campaign.audienceSegmentKey }),
  ]);
  const template = templates.find((t) => t.id === campaign.templateGroupId) ?? null;

  return NextResponse.json({ ok: true, campaign, template, breakdown });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateCampaign(id, parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, campaign: result.data });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  // Archives rather than deletes once a campaign has any send history — the service decides which.
  const result = await deleteDraftCampaign(id, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, ...result.data });
}
