import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
/** Retired provider endpoint. Existing bookmarks cannot start imports. */
export async function POST() {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "templates");
  if (denied) return denied;
  return NextResponse.json({ error: "تم إيقاف هذا التكامل. استخدم مزامنة قوالب Meta من لوحة القوالب." }, { status: 410 });
}
