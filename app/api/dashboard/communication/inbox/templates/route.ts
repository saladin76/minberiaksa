import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { conversationTemplates } from "@/lib/communication/conversation-template-service";

export const dynamic = "force-dynamic";

/** Approved templates the conversation's number can send, with a preview in the conversation's language. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const conversationId = sp.get("conversation") ?? "";
  const locale = /^[a-z]{2}$/.test(sp.get("language") ?? "") ? String(sp.get("language")) : "ar";
  if (!conversationId) return NextResponse.json({ error: "MISSING_CONVERSATION" }, { status: 400 });
  const result = await conversationTemplates(conversationId, locale, sp.get("name")).catch(() => ({ ok: false as const, reason: "TEMPLATES_UNAVAILABLE" }));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "DO_NOT_CONTACT" ? 409 : 503 });
  return NextResponse.json({ templates: result.templates }, { headers: { "Cache-Control": "private, no-store" } });
}
