import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { listChannelTemplates } from "@/lib/communication/template-compat";
import { isCommunicationChannel } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Templates for one channel, with the locales each actually carries.
 *
 * Goes through `template-compat` rather than reading a store directly, so the campaign wizard picks
 * up the SMS/WhatsApp/Email split for free — including the fact that SMS now has its own collection
 * instead of borrowing WhatsApp's.
 *
 * `availableLocales` matters to the caller: a campaign sends each donor their own language, so a
 * template covering only Arabic silently falls back for everyone else, and the wizard needs to be
 * able to say so before the send.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const channel = request.nextUrl.searchParams.get("channel");
  if (!isCommunicationChannel(channel)) {
    return NextResponse.json({ ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" }, { status: 400 });
  }

  const templates = await listChannelTemplates(channel);
  return NextResponse.json({ ok: true, templates });
}
