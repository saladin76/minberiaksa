import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { parseGa4Period } from "@/lib/marketing/ga4-period";
import { Ga4ReportError, loadGa4DashboardReport } from "@/lib/marketing/ga4-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "platformConnections");
  if (denied) return denied;
  const query = request.nextUrl.searchParams;
  let period;
  try { period = parseGa4Period({ range: query.get("range"), startDate: query.get("startDate"), endDate: query.get("endDate") }); }
  catch { return NextResponse.json({ error: "GA4_PERIOD_INVALID" }, { status: 400 }); }
  try { return NextResponse.json(await loadGa4DashboardReport(period, query.has("refresh")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Ga4ReportError ? error.message : "GA4_REPORT_FAILED" }, { status: error instanceof Ga4ReportError ? error.status : 502, headers: { "Cache-Control": "no-store" } }); }
}
