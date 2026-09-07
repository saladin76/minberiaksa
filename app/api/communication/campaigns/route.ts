import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { listCampaigns, createCampaign } from "@/lib/communication/campaign-service";
import { COMMUNICATION_CHANNELS, COMMUNICATION_PURPOSES } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HTTP surface for CommunicationCampaign.
 *
 * The service layer under `lib/communication/` was complete — CRUD, status machine, recipient
 * planning, send executor — but had no routes and no UI, so none of it was reachable. These routes
 * are a thin shell over it and deliberately add no logic of their own: the status machine in
 * `campaign-service` stays the single authority on what transition is legal.
 */

const createSchema = z.object({
  name: z.string().min(1).max(160),
  channel: z.enum(COMMUNICATION_CHANNELS),
  purpose: z.enum(COMMUNICATION_PURPOSES).optional(),
  templateGroupId: z.string().min(1).nullable().optional(),
  audienceSegmentKey: z.string().min(1).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
  const campaigns = await listCampaigns({ includeArchived });
  return NextResponse.json({ ok: true, campaigns });
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

  const result = await createCampaign(parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, campaign: result.data });
}
