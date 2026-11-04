import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";
/** Version is embedded at build time; reading the checkout at request time could lie after a failed deploy. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent");
  if (denied) return denied;
  return NextResponse.json({ sourceSha: process.env.MINBER_BUILD_SHA || null, contentChecks: "arabic-grounding-v1", subscriptionChecks: "confirmed-first-payment-v1" }, { headers: { "Cache-Control": "private, no-store" } });
}
