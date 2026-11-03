import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { OPEN_REQUEST_STATUSES } from "@/lib/donations/subscription-request-policy";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  try {
    const count = await prisma.subscriptionServiceRequest.count({ where: { status: { in: OPEN_REQUEST_STATUSES } } });
    return NextResponse.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "REQUEST_COUNT_UNAVAILABLE" }, { status: 503 });
  }
}
