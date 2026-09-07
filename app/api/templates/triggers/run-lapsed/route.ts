import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { runDonationLapsedReminders } from "@/lib/events/donation-lapsed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Preview only — counts who would be reminded without contacting any provider. */
  dryRun: z.boolean().optional(),
  max: z.number().int().min(1).max(1000).optional(),
});

/**
 * Manual "run now" for the DONATION_LAPSED reminder. Same code path the daily cron uses, so a
 * dry run here is an accurate preview of what the cron will do tonight.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const actor = auditActorFromDashboardSession(session!);
  const summary = await runDonationLapsedReminders({
    dryRun: parsed.data.dryRun ?? false,
    max: parsed.data.max,
    actorRole: actor.actorRole ?? "ADMIN",
  });
  return NextResponse.json(summary);
}
