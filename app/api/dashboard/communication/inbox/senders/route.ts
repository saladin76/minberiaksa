import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { listInboxSenders } from "@/lib/communication/conversation-service";

export const dynamic = "force-dynamic";
export async function GET() {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "messages");
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, senders: await listInboxSenders() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "INBOX_SENDERS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
