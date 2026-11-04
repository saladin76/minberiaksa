import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requestDonorLogin, verifyDonorLogin } from "@/lib/auth/donor-login-service";
import { requireLoginOrigin, loginError } from "@/lib/auth/donor-login-request";
import { isValidLocale } from "@/lib/locales";

export async function POST(request: NextRequest) {
  const blocked = requireLoginOrigin(request);
  if (blocked) return blocked;
  try {
    const body = await request.json();
    if (body.channel !== "EMAIL" && body.channel !== "WHATSAPP") return NextResponse.json({ error: "INVALID_CONTACT" }, { status: 400 });
    if (typeof body.contact !== "string" || body.contact.length > 254) return NextResponse.json({ error: "INVALID_CONTACT" }, { status: 400 });
    const session = body.link === true ? await getServerSession(authOptions) : null;
    if (body.link === true && (!session?.user?.id || session.user.role !== "DONOR")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const result = await requestDonorLogin({ channel: body.channel, contact: body.contact, locale: isValidLocale(body.locale) ? body.locale : "ar", requestKey: request.headers.get("x-real-ip") || "unknown", linkUserId: session?.user?.id });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return loginError(error); }
}

/** Linking always takes the owner from the authenticated session, never the body. */
export async function PATCH(request: NextRequest) {
  const blocked = requireLoginOrigin(request);
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "DONOR") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    await verifyDonorLogin({ challengeId: String(body.challengeId || ""), ticket: String(body.ticket || ""), code: String(body.code || ""), linkUserId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return loginError(error); }
}
