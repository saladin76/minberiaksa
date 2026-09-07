import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { buildCampaignLinkPerformanceReport } from "@/lib/marketing/campaign-links/campaign-link-performance-service";
import { parseCampaignLinkStatusFilter, readString } from "@/lib/marketing/campaign-links/campaign-link-registry-service";

export const dynamic = "force-dynamic";

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "referrals");
  if (denied) return denied;

  const days = numberParam(request, "days", 7, 1, 90);
  const limit = numberParam(request, "limit", 100, 1, 500);
  const platformParam = readString(request.nextUrl.searchParams.get("platform"));
  const platform = platformParam?.toUpperCase() === "ALL" ? null : platformParam;
  const status = parseCampaignLinkStatusFilter(request.nextUrl.searchParams.get("status"));
  const id = readString(request.nextUrl.searchParams.get("id"));

  const report = await buildCampaignLinkPerformanceReport({ days, limit, platform, status, id });
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
