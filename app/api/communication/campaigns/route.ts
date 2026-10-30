import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { listCampaigns, createCampaign } from "@/lib/communication/campaign-service";
import { getCampaignOutcomeSummary } from "@/lib/communication/campaign-attribution-service";
import { getCampaignOutcomeSnapshot } from "@/lib/communication/campaign-outcome-snapshot";
import { campaignAttributionDiagnostic } from "@/lib/communication/campaign-attribution-diagnostics";
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
  dailyCap: z.number().int().min(0).max(1_000_000).optional(),
  dailyCapEnabled: z.boolean().optional(),
  scheduledStopAt: z.string().datetime().nullable().optional(),
  resumeAt: z.string().datetime().nullable().optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezoneMode: z.enum(["RECIPIENT", "FIXED"]).optional(),
    timezone: z.string().max(120).nullable().optional(),
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
  let campaigns: Awaited<ReturnType<typeof listCampaigns>>;
  try { campaigns = await listCampaigns({ includeArchived }); }
  catch { return NextResponse.json({ ok: false, error: "تعذّر تحميل الحملات" }, { status: 503 }); }
  // Show the campaign workflow immediately; lifetime income is an independent read.
  if (request.nextUrl.searchParams.get("includeOutcomes") === "false") {
    return NextResponse.json({ ok: true, campaigns: campaigns.map(campaign => ({ ...campaign, donationCount: null, revenue: null, unpricedPaidCount: null })), outcomesReady: false });
  }
  let outcomes: Awaited<ReturnType<typeof getCampaignOutcomeSummary>>;
  let outcomesComputedAt: string | undefined;
  try {
    const ids = campaigns.map(campaign => campaign.id);
    if (request.nextUrl.searchParams.get("outcomesMode") === "poll") {
      const snapshot = getCampaignOutcomeSnapshot(ids, work => after(() => work));
      if (!snapshot.ready) return NextResponse.json({ ok: true, outcomesReady: false });
      outcomes = snapshot.summary; outcomesComputedAt = snapshot.computedAt;
    } else outcomes = await getCampaignOutcomeSummary(ids);
  }
  catch (error) { return NextResponse.json({ ok: false, error: "تعذّر تحميل إسناد الإيرادات؛ أعد المحاولة.", diagnostic: campaignAttributionDiagnostic(error) }, { status: 503 }); }
  const outcomeMetrics = outcomes.metrics;
  const enriched = campaigns.map((campaign) => {
    const outcome = outcomeMetrics.get(campaign.id);
    return {
      ...campaign,
      donationCount: outcome?.donationCount ?? 0,
      revenue: outcome?.revenue ?? 0,
      unpricedPaidCount: outcome?.unpricedPaidCount ?? 0,
      trackingRequiresTemplateUpdate: outcomes.staticTrackingCampaignIds.includes(campaign.id),
      failedDonationCount: outcome?.failedDonationCount ?? 0,
    };
  });
  return NextResponse.json({ ok: true, outcomesReady: true, outcomesComputedAt, campaigns: enriched, unattributed: outcomes.unattributed });
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
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "payload";
    const detail = issue?.message ? `${path}: ${issue.message}` : "بيانات الحملة غير صالحة";
    return NextResponse.json({ ok: false, error: detail, issues: parsed.error.flatten() }, { status: 400 });
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
