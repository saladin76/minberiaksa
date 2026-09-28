import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { listConversations, listInboxSenders } from "@/lib/communication/conversation-service";

/**
 * The WhatsApp inbox list.
 *
 * Donors reply to these messages. Until now the replies were only visible as a badge count on the
 * dashboard  the count was computed from the real archive, but there was no screen to open, so an
 * answered question stayed answered nowhere. This returns the conversations that count produces.
 *
 * Filters mirror what an operator actually triages by: which business number, and whether it is
 * still waiting on us.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const senderId = sp.get("senderId") || null;
  const filter = sp.get("filter"); // needsReply | unresolved | all
  const search = (sp.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

  const [all, senders] = await Promise.all([listConversations({ senderId }), listInboxSenders()]);

  let rows = all;
  if (filter === "needsReply") rows = rows.filter((c) => c.needsReply);
  else if (filter === "unresolved") rows = rows.filter((c) => c.unresolved);
  if (search) {
    rows = rows.filter((c) =>
      c.phone.toLowerCase().includes(search) ||
      (c.donor?.name ?? "").toLowerCase().includes(search) ||
      (c.lastInboundText ?? "").toLowerCase().includes(search));
  }

  return NextResponse.json({
    ok: true,
    conversations: rows.slice(offset, offset + limit),
    total: rows.length,
    needsReply: all.filter((c) => c.needsReply).length,
    senders,
  });
}
