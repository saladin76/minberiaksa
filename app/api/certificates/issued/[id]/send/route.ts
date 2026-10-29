import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { deliverIssuedCertificate } from "@/lib/certificates/manual-delivery";

export const runtime = "nodejs";
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent"); if (denied) return denied;
  const { channel } = await request.json().catch(() => ({}));
  if (channel !== "EMAIL" && channel !== "WHATSAPP") return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  const channelDenied = requireAdminOrDashboardPermission(session, channel === "EMAIL" ? "templates" : "messages"); if (channelDenied) return channelDenied;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await deliverIssuedCertificate(id, channel);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
