import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { transitionCampaign, getCampaign } from "@/lib/communication/campaign-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  // CONFIRM is a compound of SUBMIT_REVIEW + APPROVE — see below.
  action: z.enum(["CONFIRM", "SUBMIT_REVIEW", "APPROVE", "SCHEDULE", "CANCEL"]),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/**
 * Status transitions only — never sending.
 *
 * The legality of each move lives in `campaign-service`'s TRANSITIONS table, not here; this route
 * exists so the UI can request one. Keeping approval separate from the send route is what makes
 * "approved by a human" a real gate rather than a checkbox the send call could set for itself.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);

  /**
   * CONFIRM collapses مراجعة and اعتماد into the single "are you sure" step the operator actually
   * wants: confirm once, then send. The two-stage review only earns its keep when the approver is a
   * different person from the author, which is not how this dashboard is used.
   *
   * It stays a compound of the real transitions rather than a new status, so `campaign-service`'s
   * table remains the only authority on what is legal, both audit entries are still written, and a
   * campaign already sitting in REVIEW (from before this change) is simply approved.
   */
  if (parsed.data.action === "CONFIRM") {
    const current = await getCampaign(id);
    if (!current) return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });

    if (current.status === "DRAFT") {
      const toReview = await transitionCampaign(id, "SUBMIT_REVIEW", { actor });
      if (!toReview.ok) return NextResponse.json({ ok: false, error: toReview.error }, { status: toReview.status });
    }
    const approved = await transitionCampaign(id, "APPROVE", { actor });
    if (!approved.ok) return NextResponse.json({ ok: false, error: approved.error }, { status: approved.status });
    return NextResponse.json({ ok: true, campaign: approved.data });
  }

  const result = await transitionCampaign(id, parsed.data.action, {
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    actor,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, campaign: result.data });
}
