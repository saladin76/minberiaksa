import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { executeCampaignSend } from "@/lib/communication/campaign-send-executor";
import { planCampaignSend } from "@/lib/communication/campaign-send-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actually send.
 *
 * This is the only route in the feature that spends money and reaches real donors, so it is gated
 * three deep and each gate catches something different:
 *
 *  1. `confirm: true` in the body — a bare POST cannot send. Guards against a mis-wired button or a
 *     retried request doing it by accident.
 *  2. The executor refuses anything not already `APPROVED`, so approval stays a separate human act
 *     performed through a different route.
 *  3. The executor itself skips recipients that already have a processed delivery for this
 *     campaign+template, so a double-click cannot double-send.
 *
 * `GET` returns the dry-run plan — how many would receive it, how many would be skipped and why —
 * so the UI can show the real number before anyone commits to it.
 */

const schema = z.object({
  confirm: z.literal(true),
  batchSize: z.number().int().min(1).max(1000).optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  const plan = await planCampaignSend(id);
  return NextResponse.json({ ok: true, plan });
}

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
    return NextResponse.json(
      { ok: false, error: "التأكيد مطلوب قبل الإرسال." },
      { status: 400 },
    );
  }

  const summary = await executeCampaignSend(id, {
    actor: auditActorFromDashboardSession(session!),
    mode: "SEND_NOW",
    batchSize: parsed.data.batchSize,
  });

  // A blocked run is a legitimate answer, not a server fault — surface it with the reason intact.
  return NextResponse.json({ ok: summary.ok, summary }, { status: summary.blocked ? 409 : 200 });
}
