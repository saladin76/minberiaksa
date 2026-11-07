import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { saudiPayforReportPipeline } from "@/lib/donations/saudi-payfor-report";
import type { Prisma } from "@prisma/client";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
 const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "generalSettings"); if (denied) return denied;
 const hours = Number(request.nextUrl.searchParams.get("hours") ?? 72);
 if (!Number.isInteger(hours) || hours < 1 || hours > 720) return NextResponse.json({ error: "Invalid reporting interval" }, { status: 400 });
 const from = new Date(Date.now() - hours * 3600_000), headers = { "Cache-Control": "private, no-store" };
 try {
  const result = await prisma.donation.aggregateRaw({ pipeline: saudiPayforReportPipeline(from) as unknown as Prisma.InputJsonObject[] });
  const rows = result as unknown as Array<{ totals: unknown[]; reasons: unknown[]; declines: unknown[] }>;
  return NextResponse.json({ hours, from: from.toISOString(), totals: rows[0]?.totals[0] ?? { attempts: 0, donors: 0, paid: 0, paidUSD: 0, failed: 0, pending: 0, newRouting: 0, unpricedPaid: 0 }, reasons: rows[0]?.reasons ?? [], declines: rows[0]?.declines ?? [] }, { headers });
 } catch { return NextResponse.json({ error: "Routing report unavailable" }, { status: 503, headers }); }
}
