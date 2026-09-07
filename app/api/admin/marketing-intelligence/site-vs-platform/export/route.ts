import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function mapValue(row: JsonMap, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as JsonMap)[key];
    return "";
  }, row);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const params = new URLSearchParams();
  params.set("platform", request.nextUrl.searchParams.get("platform") || "ALL");
  params.set("days", request.nextUrl.searchParams.get("days") || "7");

  const res = await fetch(`${request.nextUrl.origin}/api/admin/marketing-intelligence/site-vs-platform?${params.toString()}`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null) as { rows?: JsonMap[] } | null;
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const columns = [
    ["platform", "platform"],
    ["campaignId", "campaignId"],
    ["campaignName", "campaignName"],
    ["currency", "currency"],
    ["platformSpend", "platformMetrics.spend"],
    ["platformImpressions", "platformMetrics.impressions"],
    ["platformClicks", "platformMetrics.clicks"],
    ["platformConversions", "platformMetrics.conversions"],
    ["platformRevenue", "platformMetrics.revenue"],
    ["platformRoas", "platformMetrics.roas"],
    ["siteDonations", "siteMetrics.donations"],
    ["siteRevenue", "siteMetrics.revenue"],
    ["siteRoas", "siteMetrics.roas"],
    ["donationGap", "gaps.donationGap"],
    ["revenueGap", "gaps.revenueGap"],
    ["roasGap", "gaps.roasGap"],
    ["verdict", "verdict.label"],
    ["action", "verdict.action"],
  ] as const;

  const lines = [columns.map(([label]) => cell(label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([, path]) => cell(mapValue(row, path))).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="site-vs-platform-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
