import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import {
  listAudienceLists,
  createAudienceList,
  addDonorMembers,
  AUDIENCE_LIST_PREFIX,
} from "@/lib/communication/audience-list-service";
import { COMMUNICATION_CHANNELS } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullable().optional(),
  channel: z.enum(COMMUNICATION_CHANNELS),
  userIds: z.array(z.string().min(1)).min(1).max(1000),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  return NextResponse.json({ ok: true, lists: await listAudienceLists() });
}

/**
 * Turn a selection of donors into a reusable audience list, and hand back the segment key.
 *
 * The selection becomes a real `CommunicationAudienceList` rather than a blob of ids on the
 * campaign, because that is what the send pipeline already understands: `audienceSegmentKey` of
 * `list:<id>` is resolved by `loadCampaignRecipients`, which reads each member's own locale and
 * re-checks consent at send time. Storing ids on the campaign would have meant a second recipient
 * path to keep in step with the first.
 *
 * Members are capped at 1000 by the service — the same ceiling `addDonorMembers` enforces — so a
 * runaway "select all" cannot silently create an audience the executor would then truncate.
 */
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

  const actor = auditActorFromDashboardSession(session!);
  const created = await createAudienceList(
    {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      type: "CUSTOM",
      channels: [parsed.data.channel],
    },
    actor,
  );
  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: created.status });

  const added = await addDonorMembers(created.data.id, parsed.data.userIds, actor);
  if (!added.ok) return NextResponse.json({ ok: false, error: added.error }, { status: added.status });

  return NextResponse.json({
    ok: true,
    listId: created.data.id,
    added: added.data.added,
    audienceSegmentKey: `${AUDIENCE_LIST_PREFIX}${created.data.id}`,
  });
}
