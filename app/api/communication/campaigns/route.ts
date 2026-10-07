import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { listCampaigns, createCampaign } from "@/lib/communication/campaign-service";
import { getCampaignOutcomeMetrics } from "@/lib/communication/campaign-attribution-service";
import { COMMUNICATION_CHANNELS, COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HTTP surface for CommunicationCampaign.
 *
 * The service layer under `lib/communication/` was complete  CRUD, status machine, recipient
 * planning, send executor  but had no routes and no UI, so none of it was reachable. These routes
 * are a thin shell over it and deliberately add no logic of their own: the status machine in
 * `campaign-service` stays the single authority on what transition is legal.
 */

const sendControlsSchema = z.object({
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
    timezone: z.string().min(1).max(120),
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

const createSchema = z.object({
  name: z.string().min(1).max(160),
  channel: z.enum(COMMUNICATION_CHANNELS),
  purpose: z.enum(COMMUNICATION_PURPOSES).optional(),
  templateGroupId: z.string().min(1).nullable().optional(),
  audienceSegmentKey: z.string().min(1).nullable().optional(),
  sendControls: sendControlsSchema.optional(),
  fallbackLocale: z.string().min(2).max(10).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
  const campaigns = await listCampaigns({ includeArchived });
  const outcomeMetrics = await getCampaignOutcomeMetrics(campaigns.map((campaign) => campaign.id));
  const enriched = campaigns.map((campaign) => {
    const outcome = outcomeMetrics.get(campaign.id);
    return {
      ...campaign,
      donationCount: outcome?.donationCount ?? 0,
      revenue: outcome?.revenue ?? 0,
      failedDonationCount: outcome?.failedDonationCount ?? 0,
    };
  });
  return NextResponse.json({ ok: true, campaigns: enriched });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { sendControls, fallbackLocale, ...campaignInput } = parsed.data;
  const result = await createCampaign(
    {
      ...campaignInput,
      ...((sendControls || fallbackLocale) ? { metadata: { ...(sendControls ? { sendControls } : {}), ...(fallbackLocale ? { fallbackLocale } : {}) } } : {}),
    },
    auditActorFromDashboardSession(session!),
  );
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, campaign: result.data });
}
