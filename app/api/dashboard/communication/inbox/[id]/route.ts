import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { getConversation, logConversationAction, markConversationHandled } from "@/lib/communication/conversation-service";
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

  const [conversation, window] = await Promise.all([
    getConversation(conversationId, { limit, before }),
    replyWindowFor(conversationId),
  ]);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, conversation, replyWindow: window });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().min(1).max(4096) }),
  z.object({ action: z.literal("handled") }),
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
    /* A reply IS handling it; the marker keeps the conversation off the queue until the donor writes
       again, matching how `needsReply` is computed. */
    await markConversationHandled(conversationId, actor).catch(() => undefined);
    return NextResponse.json({ ok: true, deliveryId: sent.deliveryId, providerMessageId: sent.providerMessageId });
  }

  if (parsed.data.action === "handled") {
    await markConversationHandled(conversationId, actor);
    return NextResponse.json({ ok: true });
  }

  await logConversationAction(conversationId, parsed.data.action, actor);
  return NextResponse.json({ ok: true });
}
