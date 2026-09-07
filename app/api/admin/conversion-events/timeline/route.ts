import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getDonationConversionTimeline } from "@/lib/tracking/conversion-timeline-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const donationId = request.nextUrl.searchParams.get("donationId")?.trim();
  if (!donationId) {
    return NextResponse.json({ ok: false, error: "missing donationId" }, { status: 400 });
  }

  const timeline = await getDonationConversionTimeline(donationId);
  return NextResponse.json({ ok: true, timeline }, { headers: { "Cache-Control": "no-store" } });
}
