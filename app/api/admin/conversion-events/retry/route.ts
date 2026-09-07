import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { syncDonationConversion } from "@/lib/tracking/donation-conversion-server";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const donationId = readString(body.donationId);
  if (!donationId) {
    return NextResponse.json({ ok: false, error: "missing donationId" }, { status: 400 });
  }

  const result = await syncDonationConversion(donationId, { force: true });
  return NextResponse.json({ ok: true, donationId, result });
}
