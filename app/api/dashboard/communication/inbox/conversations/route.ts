import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { inboxCounts, listInboxConversations, updateInboxConversation } from "@/lib/communication/inbox-conversations";
import { isInboxLanguage } from "@/lib/communication/inbox-language";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Conversations on the site's WhatsApp number, by language tab and view, with the unread counts per tab. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const sp = request.nextUrl.searchParams, userId = session?.user?.id ?? null;
  const lang = sp.get("language"), view = sp.get("view");
  try {
    const [conversations, counts] = await Promise.all([
      listInboxConversations({ language: isInboxLanguage(lang) ? lang : "all", view: view === "mine" || view === "unread" || view === "done" ? view : "all", userId, q: sp.get("q") ?? "", before: sp.get("before") }),
      inboxCounts(userId),
    ]);
    return reply({ conversations, counts });
  } catch { return reply({ error: "INBOX_UNAVAILABLE" }, 503); }
}

/** Assign (to me, to a colleague, or nobody), move to another language tab, mark read, or mark done. */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; assignToMe?: boolean; assigneeId?: unknown; assigneeName?: unknown; unassign?: boolean; language?: unknown; read?: boolean; status?: unknown };
  const patch: Parameters<typeof updateInboxConversation>[1] = {};
  if (b.assignToMe) { patch.assigneeId = session?.user?.id ?? null; patch.assigneeName = session?.user?.name || session?.user?.email || null; }
  else if (typeof b.assigneeId === "string" && /^[a-f\d]{24}$/.test(b.assigneeId)) { patch.assigneeId = b.assigneeId; patch.assigneeName = typeof b.assigneeName === "string" ? b.assigneeName.slice(0, 80) : null; }
  else if (b.unassign) patch.assigneeId = null;
  if (b.language !== undefined) patch.language = b.language;
  if (b.read === true) patch.read = true;
  if (b.status !== undefined) patch.status = b.status;
  try { await updateInboxConversation(String(b.id ?? ""), patch); return reply({ ok: true }); }
  catch (e) { const code = e instanceof Error && /^INVALID_/.test(e.message) ? e.message : "INBOX_UNAVAILABLE"; return reply({ error: code }, code === "INBOX_UNAVAILABLE" ? 503 : 400); }
}
