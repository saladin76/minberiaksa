import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

let cache: { until: number; staff: Array<{ id: string; name: string }> } | null = null;

/** Colleagues a conversation can be assigned to: everyone who can open the inbox (admins and staff with "messages"). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  if (!cache || cache.until < Date.now()) {
    const users = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] } } });
    const staff = users
      .filter((u) => userHasDashboardPermission(u as Parameters<typeof userHasDashboardPermission>[0], "messages"))
      .map((u) => ({ id: u.id, name: (u.name || u.email || "—").slice(0, 60) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cache = { until: Date.now() + 5 * 60_000, staff };
  }
  return NextResponse.json({ staff: cache.staff }, { headers: { "Cache-Control": "private, no-store" } });
}
