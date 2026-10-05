import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EMAILS = 5000;

/**
 * Bulk donation import  PREVIEW lookup. The dashboard parses the file in the browser (a large
 * workbook would exceed Vercel's request-body limit) and asks, a batch at a time, which donor
 * emails already exist so it can show new vs existing donors. READS ONLY.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "donors");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { emails?: unknown } | null;
  const emails = Array.isArray(body?.emails)
    ? [...new Set(body.emails.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean))]
    : [];
  if (emails.length > MAX_EMAILS) return NextResponse.json({ error: `الحد ${MAX_EMAILS} بريد لكل طلب.` }, { status: 400 });
  if (!emails.length || !process.env.DATABASE_URL) return NextResponse.json({ existing: [] });

  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }).catch(() => []);
  return NextResponse.json({ existing: users.map((u) => (u.email ?? "").toLowerCase()).filter(Boolean) });
}
