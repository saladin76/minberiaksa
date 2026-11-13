import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isRevenueDashboardUser } from "@/lib/dashboard/api-auth";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";

const OBJECT_ID = /^[a-f0-9]{24}$/;

/**
 * Read-only: names of internal communication campaigns, so donation tables can show
 * "حملة الشتاء | ١٣ نوفمبر" instead of a raw id. Same audience as the donations list.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isRevenueDashboardUser(session) && !userHasDashboardPermission(session.user, "monthly")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => OBJECT_ID.test(value)))].slice(0, 100);
  if (!ids.length) return NextResponse.json({ names: {} });
  const rows = await prisma.communicationCampaign.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return NextResponse.json(
    { names: Object.fromEntries(rows.map((row) => [row.id, row.name])) },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
