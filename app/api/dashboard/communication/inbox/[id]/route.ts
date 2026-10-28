import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getConversation, logConversationAction, markConversationHandled, markConversationRead } from "@/lib/communication/conversation-service";
import { replyWindowFor, sendConversationReply } from "@/lib/communication/conversation-reply-service";

/**
 * One conversation: its timeline, the state of WhatsApp's reply window, and the actions an operator
 * can take on it.
 *
 * The window is returned with the timeline rather than discovered on submit, so the compose box can
 * say up front whether a free-text answer is still possible  see
 * `lib/communication/conversation-reply-service.ts` for why it is bounded at all.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;
  const conversationId = decodeURIComponent(id);

  const sp = request.nextUrl.searchParams;
  const before = sp.get("before");
  const limit = Number(sp.get("limit") ?? 60);

  const loaded = await Promise.all([
    getConversation(conversationId, { limit, before }),
    replyWindowFor(conversationId),
  ]).catch(() => null);
  if (!loaded) return NextResponse.json({ error: "INBOX_UNAVAILABLE" }, { status: 503 });
  const [conversation, window] = loaded;
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, conversation, replyWindow: window });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().min(1).max(4096) }),
  z.object({ action: z.literal("handled") }),
  z.object({ action: z.literal("read"), eventId: z.string().regex(/^event:[a-f0-9]{24}$/i) }),
  z.object({ action: z.literal("followup") }),
  z.object({ action: z.literal("link") }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;
  const conversationId = decodeURIComponent(id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const actor = auditActorFromDashboardSession(session!);

  if (parsed.data.action === "reply") {
    const sent = await sendConversationReply(conversationId, parsed.data.body, actor);
    if (!sent.ok) {
      /* A closed window is the operator's answer, not a server fault  409, with the reason so the UI
         can point them at an approved template instead. */
      const status = sent.reason === "REPLY_WINDOW_CLOSED" ? 409 : 502;
      return NextResponse.json({ error: sent.reason, detail: sent.detail ?? null }, { status });
    }
    // The accepted outbound archive resolves the queue. A handled marker written
    // here could hide a NEW inbound message that arrived while the send was running.
    return NextResponse.json({ ok: true, deliveryId: sent.deliveryId, providerMessageId: sent.providerMessageId });
  }

  if (parsed.data.action === "read") {
    try {
      return (await markConversationRead(conversationId, parsed.data.eventId, actor)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    } catch { return NextResponse.json({ error: "READ_ACK_UNAVAILABLE" }, { status: 503 }); }
  }

  if (parsed.data.action === "handled") {
    await markConversationHandled(conversationId, actor);
    return NextResponse.json({ ok: true });
  }

  await logConversationAction(conversationId, parsed.data.action, actor);
  return NextResponse.json({ ok: true });
}
