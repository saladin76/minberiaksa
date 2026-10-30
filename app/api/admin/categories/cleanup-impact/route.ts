import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditCategoryCleanup } from "@/scripts/audit-retired-category-cleanup.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exact requested retirement scope and its references. GET never performs cleanup. */
export async function GET() {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "categories");
  if (denied) return denied;
  try {
    return NextResponse.json(await auditCategoryCleanup(prisma), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "CATEGORY_CLEANUP_IMPACT_UNAVAILABLE", readOnly: true, databaseWrites: 0 }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
