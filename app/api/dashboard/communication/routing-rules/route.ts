import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { createRoutingRule } from "@/lib/communication/routing-rule-service";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "@/lib/communication/sender-resolution";
import { COMMUNICATION_CHANNELS, COMMUNICATION_PURPOSES, type CommunicationChannelId, type CommunicationPurposeId } from "@/lib/communication/communication-runtime-types";

/**
 * Routing rules, and the one question an operator actually asks: *which number would serve this
 * recipient?*
 *
 * The rules were configurable only in the database, so their effect could not be checked before a
 * campaign went out to thousands of people. `POST /preview` answers it against the live snapshot,
 * through the same resolver the sender itself uses — so the preview cannot disagree with the send.
 */

const ruleSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  locale: z.string().min(2).max(8).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  purpose: z.enum(COMMUNICATION_PURPOSES).nullable().optional(),
  senderId: z.string().min(1),
  fallbackSenderId: z.string().min(1).nullable().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createRoutingRule(parsed.data, auditActorFromDashboardSession(session!));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, rule: result.data });
}

const previewSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  locale: z.string().max(8).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  purpose: z.enum(COMMUNICATION_PURPOSES),
});

/** GET with query params, so the preview is linkable and cheap to poll from the UI. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const parsed = previewSchema.safeParse({
    channel: sp.get("channel") ?? "WHATSAPP",
    locale: sp.get("locale") || null,
    country: sp.get("country") || null,
    purpose: sp.get("purpose") ?? "TRANSACTIONAL",
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const snapshot = await loadSenderRoutingSnapshot(parsed.data.channel as CommunicationChannelId);
  const routed = resolveSenderFromSnapshot(snapshot, {
    locale: parsed.data.locale,
    country: parsed.data.country,
    purpose: parsed.data.purpose as CommunicationPurposeId,
  });

  if (!routed.ok) {
    /* A refusal is a legitimate answer and is shown as one: this recipient would not be messaged. */
    return NextResponse.json({ ok: true, wouldSend: false, reason: routed.reason });
  }
  return NextResponse.json({
    ok: true,
    wouldSend: true,
    matchedBy: routed.matchedBy,
    sender: {
      id: routed.sender.id,
      displayPhoneNumber: routed.sender.displayPhoneNumber,
      senderEmail: routed.sender.senderEmail,
      smsSender: routed.sender.smsSender,
      provider: routed.sender.provider,
    },
  });
}
